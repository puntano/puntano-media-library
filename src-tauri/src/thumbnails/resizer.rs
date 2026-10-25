use std::fs::{self, File};
use std::io::{BufWriter, Write};
use std::path::Path;

use fast_image_resize::images::Image;
use fast_image_resize::{FilterType, PixelType, ResizeAlg, ResizeOptions, Resizer};
use image::{ColorType, DynamicImage, ImageReader};

use super::cache::ThumbnailCache;

pub struct ThumbnailResizer;

impl ThumbnailResizer {
    const TARGET_MAX_DIMENSION: u32 = 384;

    /// Downscales a photo using SIMD hardware vector instructions (AVX2/NEON) and atomically saves as JPEG.
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
            Err(decode_err) => {
                // Fallback 1: fast extraction of embedded preview JPEG for camera RAW formats (CR2, ARW, NEF, DNG, etc.)
                match Self::try_extract_raw_preview(path_ref) {
                    Ok(raw_img) => raw_img,
                    Err(_) => {
                        // Fallback 2: Native OS codec thumbnail extraction (Windows WIC/Shell for HEIC/AVIF/RAW, macOS sips)
                        Self::try_extract_os_native_thumbnail(path_ref, Self::TARGET_MAX_DIMENSION)
                            .map_err(|os_err| format!("decode failed ({}); OS fallback failed ({})", decode_err, os_err))?
                    }
                }
            }
        };

        Self::resize_and_save_atomic(&img, dst_path.as_ref())
    }

    /// Resizes a decoded image to fit within 384px and writes atomically via a temporary sibling file.
    pub fn resize_and_save_atomic(img: &DynamicImage, dst_path: &Path) -> Result<(), String> {
        let (orig_w, orig_h) = (img.width(), img.height());
        if orig_w == 0 || orig_h == 0 {
            return Err("Invalid image dimensions (0x0)".into());
        }

        // Calculate target dimensions preserving aspect ratio
        let (target_w, target_h) = Self::calculate_dimensions(orig_w, orig_h, Self::TARGET_MAX_DIMENSION);

        // Convert DynamicImage to fast_image_resize Image
        let src_image = Self::dynamic_image_to_fir(img)?;

        let mut dst_image = Image::new(target_w, target_h, src_image.pixel_type());

        // Fast SIMD-accelerated resize
        let mut resizer = Resizer::new();
        let options = ResizeOptions::new().resize_alg(ResizeAlg::Convolution(FilterType::Bilinear));

        resizer
            .resize(&src_image, &mut dst_image, &options)
            .map_err(|e| format!("SIMD resize failed: {}", e))?;

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

        let tmp_path = ThumbnailCache::temp_path_for(dst_path);

        let encode_result = (|| -> Result<(), String> {
            let out_file = File::create(&tmp_path)
                .map_err(|e| format!("Failed to create temp thumbnail file: {}", e))?;
            let mut writer = BufWriter::new(out_file);
            let mut encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut writer, 82);
            encoder
                .encode(&rgb_bytes, target_w, target_h, ColorType::Rgb8.into())
                .map_err(|e| format!("JPEG thumbnail encoding failed: {}", e))?;
            writer
                .flush()
                .map_err(|e| format!("Failed to flush thumbnail file: {}", e))?;
            Ok(())
        })();

        if let Err(e) = encode_result {
            let _ = fs::remove_file(&tmp_path);
            return Err(e);
        }

        if !ThumbnailCache::is_valid_cached_file(&tmp_path) {
            let _ = fs::remove_file(&tmp_path);
            return Err("Encoded thumbnail was empty".into());
        }

        fs::rename(&tmp_path, dst_path).map_err(|e| {
            let _ = fs::remove_file(&tmp_path);
            format!("Failed to finalize thumbnail file: {}", e)
        })
    }

    /// Native OS codec fallback for HEIC/HEIF, AVIF, Camera RAW, and Video frames.
    pub fn try_extract_os_native_thumbnail(path: &Path, max_dim: u32) -> Result<DynamicImage, String> {
        #[cfg(target_os = "windows")]
        {
            return Self::extract_windows_shell_thumbnail(path, max_dim);
        }

        #[cfg(target_os = "macos")]
        {
            return Self::extract_macos_sips_thumbnail(path, max_dim);
        }

        #[cfg(not(any(target_os = "windows", target_os = "macos")))]
        {
            let _ = (path, max_dim);
            Err("No native OS thumbnail extractor available on this platform".into())
        }
    }

    #[cfg(target_os = "windows")]
    fn extract_windows_shell_thumbnail(path: &Path, max_dim: u32) -> Result<DynamicImage, String> {
        use std::os::windows::ffi::OsStrExt;
        use windows::core::PCWSTR;
        use windows::Win32::Foundation::SIZE;
        use windows::Win32::Graphics::Gdi::{
            DeleteObject, GetDC, GetDIBits, GetObjectW, ReleaseDC, BITMAP, BITMAPINFO,
            BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HBITMAP, HGDIOBJ,
        };
        use windows::Win32::System::Com::{
            CoInitializeEx, CoUninitialize, COINIT_APARTMENTTHREADED, COINIT_DISABLE_OLE1DDE,
        };
        use windows::Win32::UI::Shell::{
            IShellItemImageFactory, SHCreateItemFromParsingName, SIIGBF_BIGGERSIZEOK,
            SIIGBF_THUMBNAILONLY,
        };

        struct ComGuard(bool);
        impl Drop for ComGuard {
            fn drop(&mut self) {
                if self.0 {
                    unsafe { CoUninitialize() };
                }
            }
        }

        struct HBitmapGuard(HBITMAP);
        impl Drop for HBitmapGuard {
            fn drop(&mut self) {
                unsafe {
                    let _ = DeleteObject(HGDIOBJ(self.0.0));
                }
            }
        }

        // Strip extended-length prefix if present, as SHCreateItemFromParsingName expects standard DOS/UNC paths
        let clean_str = path.to_string_lossy();
        let clean_path = if let Some(rest) = clean_str.strip_prefix(r"\\?\UNC\") {
            format!(r"\\{}", rest)
        } else if let Some(rest) = clean_str.strip_prefix(r"\\?\") {
            rest.to_string()
        } else {
            clean_str.into_owned()
        };

        let wide: Vec<u16> = std::ffi::OsStr::new(&clean_path)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();

        unsafe {
            let hr = CoInitializeEx(None, COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE);
            // S_OK (0) or S_FALSE (1) require matching CoUninitialize; RPC_E_CHANGED_MODE means thread already initialized COM
            let _com_guard = ComGuard(hr.is_ok());

            let factory: IShellItemImageFactory =
                SHCreateItemFromParsingName(PCWSTR(wide.as_ptr()), None)
                    .map_err(|e| format!("SHCreateItemFromParsingName failed: {}", e))?;

            let hbitmap = factory
                .GetImage(
                    SIZE {
                        cx: max_dim as i32,
                        cy: max_dim as i32,
                    },
                    SIIGBF_BIGGERSIZEOK | SIIGBF_THUMBNAILONLY,
                )
                .map_err(|e| format!("IShellItemImageFactory::GetImage failed: {}", e))?;

            let _bmp_guard = HBitmapGuard(hbitmap);

            let mut bmp = BITMAP::default();
            let got = GetObjectW(
                HGDIOBJ(hbitmap.0),
                std::mem::size_of::<BITMAP>() as i32,
                Some(&mut bmp as *mut _ as *mut _),
            );
            if got == 0 || bmp.bmWidth <= 0 || bmp.bmHeight <= 0 {
                return Err("GetObjectW returned invalid bitmap dimensions".into());
            }

            let width = bmp.bmWidth as u32;
            let height = bmp.bmHeight.unsigned_abs();
            let mut bmi = BITMAPINFO {
                bmiHeader: BITMAPINFOHEADER {
                    biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                    biWidth: width as i32,
                    biHeight: -(height as i32), // Negative height requests top-down scanlines
                    biPlanes: 1,
                    biBitCount: 32,
                    biCompression: BI_RGB.0,
                    ..Default::default()
                },
                ..Default::default()
            };

            let mut bgra = vec![0u8; (width * height * 4) as usize];
            let hdc = GetDC(None);
            let lines = GetDIBits(
                hdc,
                hbitmap,
                0,
                height,
                Some(bgra.as_mut_ptr() as *mut _),
                &mut bmi,
                DIB_RGB_COLORS,
            );
            let _ = ReleaseDC(None, hdc);

            if lines == 0 {
                return Err("GetDIBits failed to extract bitmap pixels".into());
            }

            let mut rgb = Vec::with_capacity((width * height * 3) as usize);
            for px in bgra.chunks_exact(4) {
                rgb.push(px[2]); // R
                rgb.push(px[1]); // G
                rgb.push(px[0]); // B
            }

            image::RgbImage::from_raw(width, height, rgb)
                .map(DynamicImage::ImageRgb8)
                .ok_or_else(|| "Failed to construct RgbImage from WIC bitmap".into())
        }
    }

    #[cfg(target_os = "macos")]
    fn extract_macos_sips_thumbnail(path: &Path, max_dim: u32) -> Result<DynamicImage, String> {
        let tmp_out = ThumbnailCache::temp_path_for(&std::env::temp_dir().join("puntano_sips.jpg"));
        let output = std::process::Command::new("/usr/bin/sips")
            .args([
                "-Z",
                &max_dim.to_string(),
                "-s",
                "format",
                "jpeg",
                &path.to_string_lossy(),
                "--out",
                &tmp_out.to_string_lossy(),
            ])
            .output()
            .map_err(|e| format!("sips execution failed: {}", e))?;

        if !output.status.success() || !ThumbnailCache::is_valid_cached_file(&tmp_out) {
            let _ = fs::remove_file(&tmp_out);
            return Err("sips failed to convert image".into());
        }

        let decoded = ImageReader::open(&tmp_out)
            .map_err(|e| e.to_string())
            .and_then(|r| r.with_guessed_format().map_err(|e| e.to_string()))
            .and_then(|r| r.decode().map_err(|e| e.to_string()));
        let _ = fs::remove_file(&tmp_out);
        decoded
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

    #[test]
    fn test_atomic_tiff_and_os_native_thumbnail_extraction() {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let temp_dir = std::env::temp_dir().join(format!("puntano_thumb_test_{}", nanos));
        std::fs::create_dir_all(&temp_dir).unwrap();

        // 1. Verify newly enabled TIFF decoding + atomic resize_and_save_atomic
        let tiff_src = temp_dir.join("sample_scan.tiff");
        let dst_thumb = temp_dir.join("out_thumb.jpg");
        let src_img = DynamicImage::ImageRgb8(image::RgbImage::from_fn(800, 600, |x, y| {
            image::Rgb([(x % 255) as u8, (y % 255) as u8, 128])
        }));
        src_img.save_with_format(&tiff_src, image::ImageFormat::Tiff).unwrap();

        ThumbnailResizer::generate_photo_thumbnail(&tiff_src, &dst_thumb)
            .expect("TIFF thumbnail generation should succeed");
        assert!(ThumbnailCache::is_valid_cached_file(&dst_thumb));
        let thumb_decoded = image::open(&dst_thumb).unwrap();
        assert_eq!(thumb_decoded.width(), 384);
        assert_eq!(thumb_decoded.height(), 288);

        // 2. Verify OS native Shell/sips thumbnail extractor on Windows/macOS
        #[cfg(any(target_os = "windows", target_os = "macos"))]
        {
            let native_res = ThumbnailResizer::try_extract_os_native_thumbnail(&dst_thumb, 384);
            assert!(
                native_res.is_ok(),
                "OS native thumbnail extraction failed: {:?}",
                native_res.err()
            );
            let native_img = native_res.unwrap();
            assert!(native_img.width() > 0 && native_img.height() > 0);
        }

        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}

