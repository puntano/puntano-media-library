use std::ffi::CString;
use std::path::Path;
use std::sync::Arc;
use image::{imageops::FilterType, DynamicImage, GenericImageView};
use windows::core::{HSTRING, PCSTR};
use windows::Win32::System::LibraryLoader::{GetProcAddress, LoadLibraryW};

#[derive(Debug, Clone)]
pub struct DetectedFace {
    pub bbox_x: f32, // normalized [0.0, 1.0]
    pub bbox_y: f32,
    pub bbox_w: f32,
    pub bbox_h: f32,
    pub confidence: f32,
}

#[derive(Clone)]
pub struct FaceEngine {
    inner: Arc<EngineInner>,
}

struct EngineInner {
    api: *const ort_sys::OrtApi,
    env: *mut ort_sys::OrtEnv,
    detector_session: *mut ort_sys::OrtSession,
    recognizer_session: *mut ort_sys::OrtSession,
    _allocator: *mut ort_sys::OrtAllocator,
    memory_info: *mut ort_sys::OrtMemoryInfo,
}

unsafe impl Send for EngineInner {}
unsafe impl Sync for EngineInner {}

impl Drop for EngineInner {
    fn drop(&mut self) {
        unsafe {
            if !self.detector_session.is_null() {
                ((*self.api).ReleaseSession)(self.detector_session);
            }
            if !self.recognizer_session.is_null() {
                ((*self.api).ReleaseSession)(self.recognizer_session);
            }
            if !self.memory_info.is_null() {
                ((*self.api).ReleaseMemoryInfo)(self.memory_info);
            }
            if !self.env.is_null() {
                ((*self.api).ReleaseEnv)(self.env);
            }
        }
    }
}

impl FaceEngine {
    pub fn new<P: AsRef<Path>>(models_dir: P) -> Result<Self, String> {
        let models_dir = models_dir.as_ref();
        let dll_path = models_dir.join("onnxruntime.dll");
        let detector_path = models_dir.join("detector.onnx");
        let recognizer_path = models_dir.join("recognizer.onnx");

        if !dll_path.exists() {
            return Err(format!("onnxruntime.dll not found at {:?}", dll_path));
        }
        if !detector_path.exists() {
            return Err(format!("detector.onnx not found at {:?}", detector_path));
        }
        if !recognizer_path.exists() {
            return Err(format!("recognizer.onnx not found at {:?}", recognizer_path));
        }

        let path_str = HSTRING::from(dll_path.to_str().ok_or("Invalid DLL path")?);
        unsafe {
            let handle = LoadLibraryW(&path_str).map_err(|e| format!("LoadLibraryW failed: {:?}", e))?;
            let proc = GetProcAddress(handle, PCSTR(b"OrtGetApiBase\0".as_ptr()))
                .ok_or("OrtGetApiBase symbol not found in onnxruntime.dll")?;
            let get_api_base: unsafe extern "C" fn() -> *const ort_sys::OrtApiBase = std::mem::transmute(proc);
            let api_base = get_api_base();
            if api_base.is_null() {
                return Err("OrtGetApiBase returned null".into());
            }

            let api = ((*api_base).GetApi)(20);
            if api.is_null() {
                return Err("OrtApi v20 pointer is null".into());
            }

            let mut env: *mut ort_sys::OrtEnv = std::ptr::null_mut();
            let log_id = CString::new("puntano_face").unwrap();
            let status = ((*api).CreateEnv)(
                ort_sys::OrtLoggingLevel::ORT_LOGGING_LEVEL_ERROR,
                log_id.as_ptr(),
                &mut env,
            );
            if !status.0.is_null() {
                return Err("Failed to create OrtEnv".into());
            }

            let mut opts: *mut ort_sys::OrtSessionOptions = std::ptr::null_mut();
            let _ = ((*api).CreateSessionOptions)(&mut opts);
            let _ = ((*api).SetIntraOpNumThreads)(opts, 2);

            let mut allocator: *mut ort_sys::OrtAllocator = std::ptr::null_mut();
            let _ = ((*api).GetAllocatorWithDefaultOptions)(&mut allocator);

            let mut memory_info: *mut ort_sys::OrtMemoryInfo = std::ptr::null_mut();
            let status = ((*api).CreateCpuMemoryInfo)(
                ort_sys::OrtAllocatorType::OrtArenaAllocator,
                ort_sys::OrtMemType::OrtMemTypeDefault,
                &mut memory_info,
            );
            if !status.0.is_null() {
                ((*api).ReleaseEnv)(env);
                return Err("Failed to create CpuMemoryInfo".into());
            }

            // Detector session
            let mut detector_session: *mut ort_sys::OrtSession = std::ptr::null_mut();
            let det_wstr: Vec<u16> = detector_path.to_str().unwrap().encode_utf16().chain(std::iter::once(0)).collect();
            let status = ((*api).CreateSession)(env, det_wstr.as_ptr(), opts, &mut detector_session);
            if !status.0.is_null() {
                ((*api).ReleaseMemoryInfo)(memory_info);
                ((*api).ReleaseEnv)(env);
                return Err("Failed to create detector session".into());
            }

            // Recognizer session
            let mut recognizer_session: *mut ort_sys::OrtSession = std::ptr::null_mut();
            let rec_wstr: Vec<u16> = recognizer_path.to_str().unwrap().encode_utf16().chain(std::iter::once(0)).collect();
            let status = ((*api).CreateSession)(env, rec_wstr.as_ptr(), opts, &mut recognizer_session);
            ((*api).ReleaseSessionOptions)(opts);
            if !status.0.is_null() {
                ((*api).ReleaseSession)(detector_session);
                ((*api).ReleaseMemoryInfo)(memory_info);
                ((*api).ReleaseEnv)(env);
                return Err("Failed to create recognizer session".into());
            }

            Ok(Self {
                inner: Arc::new(EngineInner {
                    api,
                    env,
                    detector_session,
                    recognizer_session,
                    _allocator: allocator,
                    memory_info,
                }),
            })
        }
    }

    /// Detect faces in an image using UltraFace 320x240 detector.
    pub fn detect_faces(&self, img: &DynamicImage, conf_threshold: f32) -> Vec<DetectedFace> {
        let (orig_w, orig_h) = img.dimensions();
        if orig_w == 0 || orig_h == 0 {
            return Vec::new();
        }

        // Resize image to 320x240 for UltraFace
        let target_w = 320;
        let target_h = 240;
        let resized = img.resize_exact(target_w, target_h, FilterType::Triangle).to_rgb8();

        // Convert to NCHW normalized [1, 3, 240, 320]
        let mut input_tensor = vec![0.0f32; 3 * target_h as usize * target_w as usize];
        let hw = (target_h * target_w) as usize;
        for y in 0..target_h {
            for x in 0..target_w {
                let p = resized.get_pixel(x, y);
                let idx = (y * target_w + x) as usize;
                // Normalize: (val - 127.0) / 128.0
                input_tensor[idx] = (p[0] as f32 - 127.0) / 128.0;          // R
                input_tensor[hw + idx] = (p[1] as f32 - 127.0) / 128.0;     // G
                input_tensor[2 * hw + idx] = (p[2] as f32 - 127.0) / 128.0; // B
            }
        }

        unsafe {
            let api = self.inner.api;
            let mut input_val: *mut ort_sys::OrtValue = std::ptr::null_mut();
            let shape = [1i64, 3, target_h as i64, target_w as i64];
            let status = ((*api).CreateTensorWithDataAsOrtValue)(
                self.inner.memory_info,
                input_tensor.as_mut_ptr() as *mut std::ffi::c_void,
                input_tensor.len() * std::mem::size_of::<f32>(),
                shape.as_ptr(),
                shape.len(),
                ort_sys::ONNXTensorElementDataType::ONNX_TENSOR_ELEMENT_DATA_TYPE_FLOAT,
                &mut input_val,
            );
            if !status.0.is_null() {
                return Vec::new();
            }

            let input_name = CString::new("input").unwrap();
            let input_names = [input_name.as_ptr()];
            let in_values = [input_val as *const ort_sys::OrtValue];

            let out_name0 = CString::new("scores").unwrap();
            let out_name1 = CString::new("boxes").unwrap();
            let out_names = [out_name0.as_ptr(), out_name1.as_ptr()];
            let mut out_values: [*mut ort_sys::OrtValue; 2] = [std::ptr::null_mut(), std::ptr::null_mut()];

            let status = ((*api).Run)(
                self.inner.detector_session,
                std::ptr::null(),
                input_names.as_ptr(),
                in_values.as_ptr(),
                1,
                out_names.as_ptr(),
                2,
                out_values.as_mut_ptr(),
            );

            ((*api).ReleaseValue)(input_val);

            if !status.0.is_null() {
                if !out_values[0].is_null() { ((*api).ReleaseValue)(out_values[0]); }
                if !out_values[1].is_null() { ((*api).ReleaseValue)(out_values[1]); }
                return Vec::new();
            }

            // Extract scores & boxes data
            let mut scores_data: *mut f32 = std::ptr::null_mut();
            let _ = ((*api).GetTensorMutableData)(out_values[0], &mut scores_data as *mut _ as *mut *mut std::ffi::c_void);
            let mut boxes_data: *mut f32 = std::ptr::null_mut();
            let _ = ((*api).GetTensorMutableData)(out_values[1], &mut boxes_data as *mut _ as *mut *mut std::ffi::c_void);

            let mut candidates = Vec::new();
            if !scores_data.is_null() && !boxes_data.is_null() {
                let num_boxes = 4420; // UltraFace 320x240 has exactly 4,420 prior boxes
                for i in 0..num_boxes {
                    let score = *scores_data.add(i * 2 + 1); // index 1 is face probability
                    if score >= conf_threshold {
                        let x1 = (*boxes_data.add(i * 4)).clamp(0.0, 1.0);
                        let y1 = (*boxes_data.add(i * 4 + 1)).clamp(0.0, 1.0);
                        let x2 = (*boxes_data.add(i * 4 + 2)).clamp(0.0, 1.0);
                        let y2 = (*boxes_data.add(i * 4 + 3)).clamp(0.0, 1.0);
                        let w = (x2 - x1).max(0.0);
                        let h = (y2 - y1).max(0.0);
                        if w > 0.03 && h > 0.03 {
                            candidates.push(DetectedFace {
                                bbox_x: x1,
                                bbox_y: y1,
                                bbox_w: w,
                                bbox_h: h,
                                confidence: score,
                            });
                        }
                    }
                }
            }

            ((*api).ReleaseValue)(out_values[0]);
            ((*api).ReleaseValue)(out_values[1]);

            // Apply Non-Maximum Suppression (NMS) to eliminate duplicate overlapping boxes
            Self::nms(candidates, 0.35)
        }
    }

    /// Extract 128-dimensional embedding from cropped face using MobileFaceNet.
    pub fn extract_embedding(&self, img: &DynamicImage, face: &DetectedFace) -> Option<[f32; 128]> {
        let (orig_w, orig_h) = img.dimensions();
        if orig_w == 0 || orig_h == 0 {
            return None;
        }

        // Expand bbox slightly (15% margin) for full facial context
        let pad_x = face.bbox_w * 0.15;
        let pad_y = face.bbox_h * 0.15;
        let x1 = ((face.bbox_x - pad_x) * orig_w as f32).max(0.0) as u32;
        let y1 = ((face.bbox_y - pad_y) * orig_h as f32).max(0.0) as u32;
        let x2 = ((face.bbox_x + face.bbox_w + pad_x) * orig_w as f32).min(orig_w as f32) as u32;
        let y2 = ((face.bbox_y + face.bbox_h + pad_y) * orig_h as f32).min(orig_h as f32) as u32;
        let w = (x2.saturating_sub(x1)).max(1);
        let h = (y2.saturating_sub(y1)).max(1);

        let cropped = img.crop_imm(x1, y1, w, h);
        let resized = cropped.resize_exact(112, 112, FilterType::Triangle).to_rgb8();

        let mut input_tensor = vec![0.0f32; 3 * 112 * 112];
        let hw = 112 * 112;
        for y in 0..112 {
            for x in 0..112 {
                let p = resized.get_pixel(x, y);
                let idx = (y * 112 + x) as usize;
                // MobileFaceNet normalization: (pixel - 127.5) / 128.0
                input_tensor[idx] = (p[0] as f32 - 127.5) / 128.0;
                input_tensor[hw + idx] = (p[1] as f32 - 127.5) / 128.0;
                input_tensor[2 * hw + idx] = (p[2] as f32 - 127.5) / 128.0;
            }
        }

        unsafe {
            let api = self.inner.api;
            let mut input_val: *mut ort_sys::OrtValue = std::ptr::null_mut();
            let shape = [1i64, 3, 112, 112];
            let status = ((*api).CreateTensorWithDataAsOrtValue)(
                self.inner.memory_info,
                input_tensor.as_mut_ptr() as *mut std::ffi::c_void,
                input_tensor.len() * std::mem::size_of::<f32>(),
                shape.as_ptr(),
                shape.len(),
                ort_sys::ONNXTensorElementDataType::ONNX_TENSOR_ELEMENT_DATA_TYPE_FLOAT,
                &mut input_val,
            );
            if !status.0.is_null() {
                return None;
            }

            let input_name = CString::new("data").unwrap();
            let input_names = [input_name.as_ptr()];
            let in_values = [input_val as *const ort_sys::OrtValue];

            let out_name = CString::new("452").unwrap();
            let out_names = [out_name.as_ptr()];
            let mut out_val: *mut ort_sys::OrtValue = std::ptr::null_mut();

            let status = ((*api).Run)(
                self.inner.recognizer_session,
                std::ptr::null(),
                input_names.as_ptr(),
                in_values.as_ptr(),
                1,
                out_names.as_ptr(),
                1,
                &mut out_val,
            );

            ((*api).ReleaseValue)(input_val);

            if !status.0.is_null() || out_val.is_null() {
                return None;
            }

            let mut out_data: *mut f32 = std::ptr::null_mut();
            let _ = ((*api).GetTensorMutableData)(out_val, &mut out_data as *mut _ as *mut *mut std::ffi::c_void);

            let mut embedding = [0.0f32; 128];
            if !out_data.is_null() {
                for i in 0..128 {
                    embedding[i] = *out_data.add(i);
                }
            }

            ((*api).ReleaseValue)(out_val);

            // L2 normalize vector
            let norm = embedding.iter().map(|v| v * v).sum::<f32>().sqrt();
            if norm > 1e-6 {
                for v in embedding.iter_mut() {
                    *v /= norm;
                }
                Some(embedding)
            } else {
                None
            }
        }
    }

    /// Compute cosine similarity between two L2-normalized 128-d embeddings.
    pub fn cosine_similarity(e1: &[f32; 128], e2: &[f32; 128]) -> f32 {
        e1.iter().zip(e2.iter()).map(|(a, b)| a * b).sum()
    }

    /// Non-Maximum Suppression algorithm
    fn nms(mut boxes: Vec<DetectedFace>, iou_threshold: f32) -> Vec<DetectedFace> {
        boxes.sort_by(|a, b| b.confidence.partial_cmp(&a.confidence).unwrap_or(std::cmp::Ordering::Equal));
        let mut picked = Vec::new();
        let mut suppressed = vec![false; boxes.len()];

        for i in 0..boxes.len() {
            if suppressed[i] {
                continue;
            }
            let b1 = &boxes[i];
            picked.push(b1.clone());

            for j in (i + 1)..boxes.len() {
                if suppressed[j] {
                    continue;
                }
                let b2 = &boxes[j];
                let iou = Self::calculate_iou(b1, b2);
                if iou >= iou_threshold {
                    suppressed[j] = true;
                }
            }
        }

        picked
    }

    fn calculate_iou(b1: &DetectedFace, b2: &DetectedFace) -> f32 {
        let x1 = b1.bbox_x.max(b2.bbox_x);
        let y1 = b1.bbox_y.max(b2.bbox_y);
        let x2 = (b1.bbox_x + b1.bbox_w).min(b2.bbox_x + b2.bbox_w);
        let y2 = (b1.bbox_y + b1.bbox_h).min(b2.bbox_y + b2.bbox_h);

        let inter_w = (x2 - x1).max(0.0);
        let inter_h = (y2 - y1).max(0.0);
        let inter_area = inter_w * inter_h;

        let area1 = b1.bbox_w * b1.bbox_h;
        let area2 = b2.bbox_w * b2.bbox_h;
        let union_area = area1 + area2 - inter_area;

        if union_area <= 0.0 {
            0.0
        } else {
            inter_area / union_area
        }
    }
}
