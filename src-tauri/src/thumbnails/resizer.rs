use std::fs::File;
use std::io::BufWriter;
use std::path::Path;

use fast_image_resize::images::Image;
use fast_image_resize::{FilterType, PixelType, ResizeAlg, ResizeOptions, Resizer};
use image::{ColorType, DynamicImage, ImageReader};

pub struct ThumbnailResizer;

impl ThumbnailResizer {
    const TARGET_MAX_DIMENSION: u32 = 384;

    /// Downscales a photo using SIMD hardware vector instructions (AVX2/NEON) and saves as WebP.
    pub fn generate_photo_thumbnail<P: AsRef<Path>, Q: AsRef<Path>>(
        src_path: P,
        dst_path: Q,
    ) -> Result<(), String> {
        let path_ref = src_path.as_ref();
        let img = match ImageReader::open(path_ref)
            .map_err(|e| e.to_string())
            .and_then(|r| r.with_guessed_format().map_err(|e| e.to_string()))
            .and_then(|r| r.decode().map_err(|e| e.to_string()))
        {
            Ok(decoded) => decoded,
            Err(_) => {
                // Fallback: fast extraction of embedded preview JPEG for camera RAW formats (CR2, ARW, NEF, DNG, etc.)
                Self::try_extract_raw_preview(path_ref)?
            }
        };

        let (orig_w, orig_h) = (img.width(), img.height());
        if orig_w == 0 || orig_h == 0 {
            return Err("Invalid image dimensions (0x0)".into());
        }

        // Calculate target dimensions preserving aspect ratio
        let (target_w, target_h) = Self::calculate_dimensions(orig_w, orig_h, Self::TARGET_MAX_DIMENSION);

        // Convert DynamicImage to fast_image_resize Image
        let src_image = Self::dynamic_image_to_fir(&img)?;

        let mut dst_image = Image::new(target_w, target_h, src_image.pixel_type());

        // Fast SIMD-accelerated resize
        let mut resizer = Resizer::new();
        let options = ResizeOptions::new().resize_alg(ResizeAlg::Convolution(FilterType::Bilinear));

        resizer
            .resize(&src_image, &mut dst_image, &options)
            .map_err(|e| format!("SIMD resize failed: {}", e))?;

        // Save as high-performance thumbnail using JPEG (100x faster than pure-Rust lossless WebP)
        let out_file = File::create(dst_path.as_ref())
            .map_err(|e| format!("Failed to create thumbnail file: {}", e))?;
        let mut writer = BufWriter::new(out_file);

        let rgb_bytes = match src_image.pixel_type() {
            PixelType::U8x4 => {
                let raw = dst_image.buffer();
                let mut rgb = Vec::with_capacity((target_w * target_h * 3) as usize);
                for chunk in raw.chunks_exact(4) {
                    rgb.push(chunk[0]);
                    rgb.push(chunk[1]);
                    rgb.push(chunk[2]);
                }
                rgb
            }
            _ => dst_image.buffer().to_vec(),
        };

        let mut encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut writer, 82);
        encoder
            .encode(&rgb_bytes, target_w, target_h, ColorType::Rgb8.into())
            .map_err(|e| format!("JPEG thumbnail encoding failed: {}", e))?;

        Ok(())
    }

    fn calculate_dimensions(w: u32, h: u32, max_dim: u32) -> (u32, u32) {
        if w <= max_dim && h <= max_dim {
            return (w, h);
        }

        if w >= h {
            let scale = max_dim as f64 / w as f64;
            (max_dim, ((h as f64 * scale).round() as u32).max(1))
        } else {
            let scale = max_dim as f64 / h as f64;
            (((w as f64 * scale).round() as u32).max(1), max_dim)
        }
    }

    fn dynamic_image_to_fir(img: &DynamicImage) -> Result<Image<'static>, String> {
        match img {
            DynamicImage::ImageRgb8(rgb) => {
                let w = rgb.width();
                let h = rgb.height();
                Ok(Image::from_vec_u8(w, h, rgb.clone().into_raw(), PixelType::U8x3)
                    .map_err(|e| format!("FIR buffer creation failed: {}", e))?)
            }
            DynamicImage::ImageRgba8(rgba) => {
                let w = rgba.width();
                let h = rgba.height();
                Ok(Image::from_vec_u8(w, h, rgba.clone().into_raw(), PixelType::U8x4)
                    .map_err(|e| format!("FIR buffer creation failed: {}", e))?)
            }
            _ => {
                let rgba = img.to_rgba8();
                let w = rgba.width();
                let h = rgba.height();
                Ok(Image::from_vec_u8(w, h, rgba.into_raw(), PixelType::U8x4)
                    .map_err(|e| format!("FIR buffer creation failed: {}", e))?)
            }
        }
    }

    /// Fast scan for embedded preview JPEG in camera RAW files (Canon CR2/CR3, Nikon NEF, Sony ARW, Adobe DNG)
    fn try_extract_raw_preview(path: &Path) -> Result<DynamicImage, String> {
        use std::io::Read;

        let mut file = File::open(path).map_err(|e| format!("Failed to open RAW file: {}", e))?;
        // Read up to 8MB where embedded preview JPEGs are located in modern camera RAW headers
        let mut buffer = Vec::new();
        let max_read = 8 * 1024 * 1024;
        let mut take = (&mut file).take(max_read);
        take.read_to_end(&mut buffer).map_err(|e| format!("Failed to read RAW header: {}", e))?;

        if buffer.len() < 4 {
            return Err("RAW file buffer too small".into());
        }

        // Search for embedded JPEG start markers: [0xFF, 0xD8, 0xFF]
        let mut start_indices = Vec::new();
        for i in 0..(buffer.len().saturating_sub(3)) {
            if buffer[i] == 0xFF && buffer[i + 1] == 0xD8 && buffer[i + 2] == 0xFF {
                start_indices.push(i);
            }
        }

        // Try decoding candidate slices and select the highest resolution embedded preview
        let mut best_img: Option<DynamicImage> = None;
        let mut best_pixels = 0u64;

        for &start in &start_indices {
            let slice = &buffer[start..];
            if slice.len() > 128 {
                if let Ok(img) = image::load_from_memory(slice) {
                    let pixels = (img.width() as u64) * (img.height() as u64);
                    if pixels > best_pixels {
                        best_pixels = pixels;
                        best_img = Some(img);
                    }
                }
            }
        }

        if let Some(img) = best_img {
            return Ok(img);
        }

        Err("No embedded preview found in RAW file".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn test_extract_embedded_raw_preview() {
        // Synthesize a JPEG in memory (200x200 RGB)
        let img = DynamicImage::new_rgb8(200, 200);
        let mut jpeg_buf = std::io::Cursor::new(Vec::new());
        img.write_to(&mut jpeg_buf, image::ImageFormat::Jpeg).unwrap();
        let jpeg_bytes = jpeg_buf.into_inner();

        // Create a synthetic RAW container with RAW header prefix + embedded JPEG
        let temp_dir = std::env::temp_dir();
        let raw_path = temp_dir.join(format!("test_sample_{}.cr2", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));

        let mut file = std::fs::File::create(&raw_path).unwrap();
        // Canon CR2 header signature + dummy metadata padding
        file.write_all(b"II*\0\x10\0\0\0CR\x02\0").unwrap();
        file.write_all(&vec![0u8; 1024]).unwrap();
        file.write_all(&jpeg_bytes).unwrap();
        drop(file);

        let extracted = ThumbnailResizer::try_extract_raw_preview(&raw_path);
        let _ = std::fs::remove_file(&raw_path);

        assert!(extracted.is_ok(), "Failed to extract embedded JPEG preview from simulated RAW file");
        let decoded = extracted.unwrap();
        assert_eq!(decoded.width(), 200);
        assert_eq!(decoded.height(), 200);
    }
}

