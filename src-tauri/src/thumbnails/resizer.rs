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
        let reader = ImageReader::open(src_path.as_ref())
            .map_err(|e| format!("Failed to open image file: {}", e))?
            .with_guessed_format()
            .map_err(|e| format!("Failed to identify format: {}", e))?;

        let img = reader
            .decode()
            .map_err(|e| format!("Failed to decode image: {}", e))?;

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
}
