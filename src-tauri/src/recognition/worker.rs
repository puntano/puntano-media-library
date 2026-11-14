use std::path::PathBuf;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use std::time::Duration;
use rusqlite::Connection;
use tauri::{AppHandle, Emitter, Manager};

use crate::db::batch::MediaRepository;
use crate::recognition::clustering::FaceClusterer;
use crate::recognition::engine::FaceEngine;

#[derive(Debug, Clone, serde::Serialize)]
pub struct FaceScanProgress {
    pub total_scannable: i64,
    pub total_scanned: i64,
    pub faces_found: i64,
    pub people_identified: i64,
    pub current_file: Option<String>,
    pub is_running: bool,
}

pub struct FaceScanWorker {
    db: Arc<Mutex<Connection>>,
    engine: Mutex<Option<Arc<FaceEngine>>>,
    app_handle: AppHandle,
    is_running: Arc<AtomicBool>,
}

impl FaceScanWorker {
    pub fn new(db: Arc<Mutex<Connection>>, app_handle: AppHandle) -> Self {
        Self {
            db,
            engine: Mutex::new(None),
            app_handle,
            is_running: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn find_models_dir(app_handle: &AppHandle) -> Option<PathBuf> {
        let mut candidates = Vec::new();

        if let Ok(res_dir) = app_handle.path().resource_dir() {
            candidates.push(res_dir.join("resources").join("models"));
            candidates.push(res_dir.join("models"));
        }

        if let Ok(exe_path) = std::env::current_exe() {
            if let Some(parent) = exe_path.parent() {
                candidates.push(parent.join("resources").join("models"));
                candidates.push(parent.join("models"));
            }
        }

        candidates.push(PathBuf::from("src-tauri/resources/models"));
        candidates.push(PathBuf::from("resources/models"));
        candidates.push(PathBuf::from("models"));

        for path in candidates {
            if path.join("detector.onnx").exists() && path.join("onnxruntime.dll").exists() {
                log::info!("[FaceScanWorker] Found face models directory at: {:?}", path);
                return Some(path);
            }
        }

        log::warn!("[FaceScanWorker] Could not find models directory containing detector.onnx and onnxruntime.dll");
        None
    }

    fn init_engine(app_handle: &AppHandle) -> Option<Arc<FaceEngine>> {
        let models_dir = Self::find_models_dir(app_handle)?;
        match FaceEngine::new(&models_dir) {
            Ok(engine) => {
                log::info!("[FaceScanWorker] FaceEngine initialized successfully with ONNX Runtime v1.20.1");
                Some(Arc::new(engine))
            }
            Err(err) => {
                log::error!("[FaceScanWorker] Failed to initialize FaceEngine: {}", err);
                None
            }
        }
    }

    pub fn is_running(&self) -> bool {
        self.is_running.load(Ordering::Relaxed)
    }

    pub fn stop(&self) {
        self.is_running.store(false, Ordering::Relaxed);
    }

    pub fn rescan(&self) -> Result<bool, String> {
        self.stop();
        // Wait briefly if a scan iteration is mid-flight
        std::thread::sleep(Duration::from_millis(100));

        {
            let mut conn = self.db.lock().map_err(|e| e.to_string())?;
            MediaRepository::reset_face_scan(&mut conn).map_err(|e| e.to_string())?;
        }

        let face_thumb_dir = self
            .app_handle
            .path()
            .app_cache_dir()
            .unwrap_or_else(|_| PathBuf::from("."))
            .join("faces");
        if face_thumb_dir.exists() {
            let _ = std::fs::remove_dir_all(&face_thumb_dir);
        }

        self.start_scan()
    }

    pub fn get_progress(&self) -> Result<FaceScanProgress, String> {
        let conn = self.db.lock().map_err(|e| e.to_string())?;
        let (total_scannable, total_scanned, faces_found, people_identified) =
            MediaRepository::get_face_scan_stats(&conn).map_err(|e| e.to_string())?;

        Ok(FaceScanProgress {
            total_scannable,
            total_scanned,
            faces_found,
            people_identified,
            current_file: None,
            is_running: self.is_running(),
        })
    }

    pub fn start_scan(&self) -> Result<bool, String> {
        if self.is_running.load(Ordering::Relaxed) {
            return Ok(false); // Already running
        }

        let engine = {
            let mut engine_guard = self.engine.lock().map_err(|e| e.to_string())?;
            if engine_guard.is_none() {
                match Self::init_engine(&self.app_handle) {
                    Some(e) => {
                        *engine_guard = Some(e);
                    }
                    None => {
                        return Err("FaceEngine failed to initialize (models or runtime DLL missing)".into());
                    }
                }
            }
            Arc::clone(engine_guard.as_ref().unwrap())
        };

        self.is_running.store(true, Ordering::Relaxed);

        let db = Arc::clone(&self.db);
        let app_handle = self.app_handle.clone();
        let is_running = Arc::clone(&self.is_running);

        std::thread::spawn(move || {
            log::info!("[FaceScanWorker] Background facial recognition scan started.");
            let clusterer = FaceClusterer::new(0.60);
            let face_thumb_dir = app_handle
                .path()
                .app_cache_dir()
                .unwrap_or_else(|_| PathBuf::from("."))
                .join("faces");
            let _ = std::fs::create_dir_all(&face_thumb_dir);

            // Load centroids once into memory and update incrementally instead of re-reading all embeddings per photo
            let mut centroids = {
                match db.lock() {
                    Ok(conn) => MediaRepository::get_all_person_centroids(&conn).unwrap_or_default(),
                    Err(_) => Vec::new(),
                }
            };
            let mut processed_since_emit: usize = 0;

            while is_running.load(Ordering::Relaxed) {
                let batch = {
                    let conn = match db.lock() {
                        Ok(c) => c,
                        Err(_) => break,
                    };
                    match MediaRepository::get_unscanned_media_batch(&conn, 15) {
                        Ok(b) => b,
                        Err(err) => {
                            log::error!("[FaceScanWorker] Error fetching unscanned media: {}", err);
                            break;
                        }
                    }
                };

                if batch.is_empty() {
                    log::info!("[FaceScanWorker] All media scanned. Face scanning complete.");
                    break;
                }

                for (media_id, file_path, orientation) in &batch {
                    if !is_running.load(Ordering::Relaxed) {
                        break;
                    }

                    // Open image (skip unreadable/corrupt files gracefully)
                    let raw_img = match image::open(file_path) {
                        Ok(im) => im,
                        Err(_) => {
                            if let Ok(mut conn) = db.lock() {
                                let _ = MediaRepository::mark_media_face_scanned(&mut conn, &[*media_id]);
                            }
                            continue;
                        }
                    };

                    // Apply EXIF orientation so faces are upright before detection & embedding
                    let img = FaceEngine::apply_orientation(raw_img, *orientation);

                    // Detect faces on upright, aspect-preserving letterboxed image
                    let detected = engine.detect_faces(&img, 0.62);
                    let mut oriented_faces = Vec::new();
                    let mut db_face_data = Vec::new();

                    for face in &detected {
                        if let Some(emb) = engine.extract_embedding(&img, face) {
                            let (rbx, rby, rbw, rbh) = FaceEngine::untransform_bbox(
                                face.bbox_x,
                                face.bbox_y,
                                face.bbox_w,
                                face.bbox_h,
                                *orientation,
                            );
                            let mut raw_face = face.clone();
                            raw_face.bbox_x = rbx;
                            raw_face.bbox_y = rby;
                            raw_face.bbox_w = rbw;
                            raw_face.bbox_h = rbh;

                            oriented_faces.push(face.clone());
                            db_face_data.push((raw_face, emb));
                        }
                    }

                    // Insert detected faces into DB, assign/cluster, and pre-generate 200x200 face avatars
                    let mut inserted_for_thumbs = Vec::new();
                    if let Ok(mut conn) = db.lock() {
                        if !db_face_data.is_empty() {
                            if let Ok(inserted_ids) =
                                MediaRepository::insert_media_faces(&mut conn, *media_id, &db_face_data)
                            {
                                for (idx, (_, emb)) in db_face_data.iter().enumerate() {
                                    let face_id = inserted_ids[idx];
                                    inserted_for_thumbs.push((face_id, oriented_faces[idx].clone()));

                                    if let Some(pid) = clusterer.match_person(emb, &centroids) {
                                        let _ = MediaRepository::assign_face_to_person(&conn, face_id, pid);
                                        if let Some(c) = centroids.iter_mut().find(|c| c.person_id == pid) {
                                            let n = c.face_count as f32;
                                            let mut sum_norm = 0.0f32;
                                            for i in 0..128 {
                                                c.embedding[i] = c.embedding[i] * n + emb[i];
                                                sum_norm += c.embedding[i] * c.embedding[i];
                                            }
                                            let norm = sum_norm.sqrt();
                                            if norm > 1e-6 {
                                                for i in 0..128 {
                                                    c.embedding[i] /= norm;
                                                }
                                            }
                                            c.face_count += 1;
                                        }
                                    } else if let Ok(new_pid) =
                                        MediaRepository::create_person_with_face(&conn, None, face_id)
                                    {
                                        centroids.push(crate::recognition::clustering::PersonCentroid {
                                            person_id: new_pid,
                                            embedding: *emb,
                                            face_count: 1,
                                        });
                                    }
                                }
                            }
                        }

                        let _ = MediaRepository::mark_media_face_scanned(&mut conn, &[*media_id]);
                        processed_since_emit += 1;

                        if processed_since_emit >= 5 {
                            processed_since_emit = 0;
                            if let Ok((total_scannable, total_scanned, faces_found, people_identified)) =
                                MediaRepository::get_face_scan_stats(&conn)
                            {
                                let progress = FaceScanProgress {
                                    total_scannable,
                                    total_scanned,
                                    faces_found,
                                    people_identified,
                                    current_file: Some(file_path.clone()),
                                    is_running: true,
                                };
                                let _ = app_handle.emit("recognition:progress", &progress);
                            }
                        }
                    }

                    // Pre-generate upright 200x200 face avatar JPEGs while `img` is already decoded in RAM
                    if !inserted_for_thumbs.is_empty() {
                        use image::GenericImageView;
                        let (w, h) = img.dimensions();
                        for (face_id, oface) in inserted_for_thumbs {
                            let pad_x = oface.bbox_w * 0.20;
                            let pad_y = oface.bbox_h * 0.20;
                            let x1 = ((oface.bbox_x - pad_x) * w as f32).max(0.0) as u32;
                            let y1 = ((oface.bbox_y - pad_y) * h as f32).max(0.0) as u32;
                            let x2 = ((oface.bbox_x + oface.bbox_w + pad_x) * w as f32).min(w as f32) as u32;
                            let y2 = ((oface.bbox_y + oface.bbox_h + pad_y) * h as f32).min(h as f32) as u32;
                            let crop_w = (x2.saturating_sub(x1)).max(1);
                            let crop_h = (y2.saturating_sub(y1)).max(1);
                            let cropped = img.crop_imm(x1, y1, crop_w, crop_h);
                            let thumb = cropped.resize_exact(200, 200, image::imageops::FilterType::Triangle);
                            let _ = thumb.save(face_thumb_dir.join(format!("{}.jpg", face_id)));
                        }
                    }

                    // Yield CPU briefly to keep UI smooth
                    std::thread::sleep(Duration::from_millis(5));
                }
            }

            is_running.store(false, Ordering::Relaxed);

            // Final progress event
            if let Ok(conn) = db.lock() {
                if let Ok((total_scannable, total_scanned, faces_found, people_identified)) =
                    MediaRepository::get_face_scan_stats(&conn)
                {
                    let final_progress = FaceScanProgress {
                        total_scannable,
                        total_scanned,
                        faces_found,
                        people_identified,
                        current_file: None,
                        is_running: false,
                    };
                    let _ = app_handle.emit("recognition:progress", &final_progress);
                }
            }

            log::info!("[FaceScanWorker] Face scan worker thread finished.");
        });

        Ok(true)
    }
}
