use std::path::{Path, PathBuf};
use std::process::Command;

pub struct VideoKeyframeExtractor;

impl VideoKeyframeExtractor {
    /// Attempts to locate FFmpeg in the Tauri sidecar path, local app directory, or system PATH.
    pub fn find_ffmpeg_binary() -> Option<PathBuf> {
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
        let status = Command::new(ffmpeg_name)
            .arg("-version")
            .output();

        if let Ok(output) = status {
            if output.status.success() {
                return Some(PathBuf::from(ffmpeg_name));
            }
        }

        None
    }

    /// Extracts a keyframe at 1.0s or 10% of duration and saves directly to destination as WebP/JPEG.
    pub fn extract_keyframe<P: AsRef<Path>, Q: AsRef<Path>>(
        src_path: P,
        dst_path: Q,
        duration: Option<f64>,
    ) -> Result<(), String> {
        if let Some(ffmpeg) = Self::find_ffmpeg_binary() {
            // Seek to 1.0s or 10% of video duration, whichever is smaller
            let seek_time = match duration {
                Some(d) if d > 1.0 => (d * 0.1).min(3.0),
                _ => 0.5,
            };
            let seek_str = format!("{:.2}", seek_time);

            if let Ok(output) = Command::new(&ffmpeg)
                .args([
                    "-ss",
                    &seek_str,
                    "-i",
                    &src_path.as_ref().to_string_lossy(),
                    "-vframes",
                    "1",
                    "-vf",
                    "scale=384:-1",
                    "-q:v",
                    "3",
                    "-y",
                    &dst_path.as_ref().to_string_lossy(),
                ])
                .output()
            {
                if output.status.success() && dst_path.as_ref().exists() {
                    return Ok(());
                }
            }
        }

        // Fallback 1: Check for an embedded JPEG cover/preview atom inside the MP4/MOV container
        if super::resizer::ThumbnailResizer::generate_photo_thumbnail(&src_path, &dst_path).is_ok()
            && dst_path.as_ref().exists()
        {
            return Ok(());
        }

        // Fallback 2: Generate a stylized cinema filmstrip poster if no FFmpeg or embedded cover exists
        Self::generate_fallback_video_poster(dst_path, duration)
    }

    /// Fallback video poster generator when FFmpeg binary is absent on the host
    fn generate_fallback_video_poster<P: AsRef<Path>>(
        dst_path: P,
        _duration: Option<f64>,
    ) -> Result<(), String> {
        use std::fs::File;
        use std::io::BufWriter;
        use image::{ColorType, ImageBuffer, Rgb};

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

        let out_file = File::create(dst_path.as_ref())
            .map_err(|e| format!("Failed to create fallback poster: {}", e))?;
        let mut writer = BufWriter::new(out_file);

        let mut encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut writer, 85);
        encoder
            .encode(img.as_raw(), width, height, ColorType::Rgb8.into())
            .map_err(|e| format!("Failed to encode fallback JPEG: {}", e))?;

        Ok(())
    }
}
