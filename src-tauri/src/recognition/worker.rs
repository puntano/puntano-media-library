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
    engine: Option<Arc<FaceEngine>>,
    app_handle: AppHandle,
    is_running: Arc<AtomicBool>,
}

impl FaceScanWorker {
    pub fn new(db: Arc<Mutex<Connection>>, app_handle: AppHandle) -> Self {
        let engine = Self::init_engine(&app_handle);
        Self {
            db,
            engine,
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

        let engine = match &self.engine {
            Some(e) => Arc::clone(e),
            None => {
                return Err("FaceEngine is not initialized (models or runtime DLL missing)".into());
            }
        };

        self.is_running.store(true, Ordering::Relaxed);

        let db = Arc::clone(&self.db);
        let app_handle = self.app_handle.clone();
        let is_running = Arc::clone(&self.is_running);

        std::thread::spawn(move || {
            log::info!("[FaceScanWorker] Background facial recognition scan started.");
            let clusterer = FaceClusterer::new(0.65);

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

                for (media_id, file_path) in &batch {
                    if !is_running.load(Ordering::Relaxed) {
                        break;
                    }

                    // Open image (skip unreadable/corrupt files gracefully)
                    let img = match image::open(file_path) {
                        Ok(im) => im,
                        Err(_) => {
                            // Mark as scanned to avoid infinite loop on corrupt media
                            if let Ok(mut conn) = db.lock() {
                                let _ = MediaRepository::mark_media_face_scanned(&mut conn, &[*media_id]);
                            }
                            continue;
                        }
                    };

                    // Detect faces
                    let detected = engine.detect_faces(&img, 0.70);
                    let mut face_data = Vec::new();

                    for face in &detected {
                        if let Some(emb) = engine.extract_embedding(&img, face) {
                            face_data.push((face.clone(), emb));
                        }
                    }

                    // Insert detected faces into DB and assign/cluster
                    if let Ok(mut conn) = db.lock() {
                        if !face_data.is_empty() {
                            if let Ok(inserted_ids) =
                                MediaRepository::insert_media_faces(&mut conn, *media_id, &face_data)
                            {
                                if let Ok(centroids) = MediaRepository::get_all_person_centroids(&conn) {
                                    for (idx, (_, emb)) in face_data.iter().enumerate() {
                                        let face_id = inserted_ids[idx];
                                        if let Some(pid) = clusterer.match_person(emb, &centroids) {
                                            let _ = MediaRepository::assign_face_to_person(&conn, face_id, pid);
                                        } else {
                                            let _ = MediaRepository::create_person_with_face(&conn, None, face_id);
                                        }
                                    }
                                }
                            }
                        }

                        let _ = MediaRepository::mark_media_face_scanned(&mut conn, &[*media_id]);

                        // Emit periodic progress
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
