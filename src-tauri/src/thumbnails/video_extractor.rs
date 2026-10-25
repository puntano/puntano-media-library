use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::OnceLock;

use super::cache::ThumbnailCache;

static FFMPEG_BIN: OnceLock<Option<PathBuf>> = OnceLock::new();

pub struct VideoKeyframeExtractor;

impl VideoKeyframeExtractor {
    #[cfg(target_os = "windows")]
    fn configure_command_no_window(cmd: &mut Command) {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    #[cfg(not(target_os = "windows"))]
    fn configure_command_no_window(_cmd: &mut Command) {}

    /// Attempts to locate FFmpeg in the Tauri sidecar path, local app directory, or system PATH (cached once).
    pub fn find_ffmpeg_binary() -> Option<PathBuf> {
        FFMPEG_BIN
            .get_or_init(|| {
                // 1. Check current directory resources/bin
                let local_bin = PathBuf::from("resources").join("bin");
                #[cfg(target_os = "windows")]
                let ffmpeg_name = "ffmpeg.exe";
                #[cfg(not(target_os = "windows"))]
                let ffmpeg_name = "ffmpeg";

                let candidate = local_bin.join(ffmpeg_name);
                if candidate.exists() {
                    return Some(candidate);
                }

                // 2. Check system PATH by probing `ffmpeg -version`
                let mut cmd = Command::new(ffmpeg_name);
                cmd.arg("-version");
                Self::configure_command_no_window(&mut cmd);

                if let Ok(output) = cmd.output() {
                    if output.status.success() {
                        return Some(PathBuf::from(ffmpeg_name));
                    }
                }

                None
            })
            .clone()
    }

    /// Extracts a keyframe at 1.0s or 10% of duration and saves atomically to destination as JPEG.
    pub fn extract_keyframe<P: AsRef<Path>, Q: AsRef<Path>>(
        src_path: P,
        dst_path: Q,
        duration: Option<f64>,
    ) -> Result<(), String> {
        let src_ref = src_path.as_ref();
        let dst_ref = dst_path.as_ref();

        let src_meta = fs::metadata(src_ref)
            .map_err(|e| format!("Video file inaccessible: {}", e))?;
        if src_meta.len() == 0 {
            return Err("Video file is 0 bytes".into());
        }

        if let Some(ffmpeg) = Self::find_ffmpeg_binary() {
            // Seek to 1.0s or 10% of video duration, whichever is smaller
            let seek_time = match duration {
                Some(d) if d > 1.0 => (d * 0.1).min(3.0),
                _ => 0.5,
            };
            let seek_str = format!("{:.2}", seek_time);
            let tmp_path = ThumbnailCache::temp_path_for(dst_ref);

            let mut cmd = Command::new(&ffmpeg);
            cmd.args([
                "-ss",
                &seek_str,
                "-i",
                &src_ref.to_string_lossy(),
                "-vframes",
                "1",
                "-vf",
                "scale=384:-1",
                "-q:v",
                "3",
                "-y",
                &tmp_path.to_string_lossy(),
            ]);
            Self::configure_command_no_window(&mut cmd);

            if let Ok(output) = cmd.output() {
                if output.status.success() && ThumbnailCache::is_valid_cached_file(&tmp_path) {
                    if fs::rename(&tmp_path, dst_ref).is_ok() {
                        return Ok(());
                    }
                }
            }
            let _ = fs::remove_file(&tmp_path);
        }

        // Fallback 1: Native OS video keyframe extraction (Windows Media Foundation / Shell)
        if let Ok(os_frame) = super::resizer::ThumbnailResizer::try_extract_os_native_thumbnail(src_ref, 384) {
            if super::resizer::ThumbnailResizer::resize_and_save_atomic(&os_frame, dst_ref).is_ok()
                && ThumbnailCache::is_valid_cached_file(dst_ref)
            {
                return Ok(());
            }
        }

        // Fallback 2: Check for an embedded JPEG cover/preview atom inside the MP4/MOV container
        if super::resizer::ThumbnailResizer::generate_photo_thumbnail(src_ref, dst_ref).is_ok()
            && ThumbnailCache::is_valid_cached_file(dst_ref)
        {
            return Ok(());
        }

        // Fallback 3: Generate a stylized cinema filmstrip poster if no FFmpeg, OS codec, or embedded cover exists
        Self::generate_fallback_video_poster(dst_ref, duration)
    }

    /// Fallback video poster generator when FFmpeg binary and OS video codec are absent on the host
    fn generate_fallback_video_poster<P: AsRef<Path>>(
        dst_path: P,
        _duration: Option<f64>,
    ) -> Result<(), String> {
        use std::fs::File;
        use std::io::{BufWriter, Write};
        use image::{ColorType, ImageBuffer, Rgb};

        let dst_ref = dst_path.as_ref();
        let width = 384u32;
        let height = 216u32;
        let cx = (width / 2) as f32;
        let cy = (height / 2) as f32;

        let img = ImageBuffer::from_fn(width, height, |x, y| {
            // Filmstrip top/bottom border bands
            if y < 22 || y >= height - 22 {
                let in_sprocket_y = (y >= 6 && y <= 15) || (y >= height - 16 && y <= height - 7);
                let sprocket_x = x % 32;
                if in_sprocket_y && sprocket_x >= 8 && sprocket_x <= 20 {
                    return Rgb([30, 41, 59]);
                }
                return Rgb([11, 15, 25]);
            }

            // Center circular play button & triangle
            let dx = x as f32 - cx;
            let dy = y as f32 - cy;
            let dist = (dx * dx + dy * dy).sqrt();

            // Play triangle inside circle (pointing right)
            if dx >= -8.0 && dx <= 14.0 {
                let half_h = (14.0 - dx) * 0.58;
                if dy.abs() <= half_h {
                    return Rgb([255, 255, 255]);
                }
            }

            if dist <= 30.0 {
                if dist >= 27.5 {
                    return Rgb([96, 165, 250]); // Ring border
                }
                return Rgb([37, 99, 235]); // Accent blue fill
            }

            // Subtle radial + vertical slate gradient
            let norm_y = y as f32 / height as f32;
            let glow = (1.0 - (dist / 180.0).min(1.0)) * 14.0;
            let r = (18.0 + norm_y * 10.0 + glow * 0.6) as u8;
            let g = (26.0 + norm_y * 14.0 + glow * 0.9) as u8;
            let b = (42.0 + norm_y * 20.0 + glow * 1.4) as u8;
            Rgb([r, g, b])
        });

        let tmp_path = ThumbnailCache::temp_path_for(dst_ref);
        let write_res = (|| -> Result<(), String> {
            let out_file = File::create(&tmp_path)
                .map_err(|e| format!("Failed to create fallback poster: {}", e))?;
            let mut writer = BufWriter::new(out_file);
            let mut encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut writer, 85);
            encoder
                .encode(img.as_raw(), width, height, ColorType::Rgb8.into())
                .map_err(|e| format!("Failed to encode fallback JPEG: {}", e))?;
            writer
                .flush()
                .map_err(|e| format!("Failed to flush fallback JPEG: {}", e))?;
            Ok(())
        })();

        if let Err(e) = write_res {
            let _ = fs::remove_file(&tmp_path);
            return Err(e);
        }

        fs::rename(&tmp_path, dst_ref).map_err(|e| {
            let _ = fs::remove_file(&tmp_path);
            format!("Failed to finalize fallback poster: {}", e)
        })
    }
}
