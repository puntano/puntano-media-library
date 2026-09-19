use std::path::Path;
use chrono::NaiveDateTime;
use nom_exif::{EntryValue, Exif, ExifTag, MediaParser, MediaSource};

#[derive(Default, Debug)]
pub struct ExtractedPhotoMetadata {
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub orientation: u32,
    pub captured_at: Option<i64>, // Epoch ms
    pub captured_at_local: Option<String>,
    pub timezone_offset: Option<i32>,
    pub latitude: Option<f64>,
    pub longitude: Option<f64>,
    pub altitude: Option<f64>,
    pub camera_make: Option<String>,
    pub camera_model: Option<String>,
    pub lens_model: Option<String>,
    pub focal_length: Option<f64>,
    pub aperture: Option<f64>,
    pub iso: Option<u32>,
    pub exposure_time: Option<String>,
}

pub struct PhotoMetadataParser;

impl PhotoMetadataParser {
    /// Non-blocking metadata parsing: reads the file header (EXIF/XMP) without loading full image pixels.
    pub fn parse<P: AsRef<Path>>(path: P) -> ExtractedPhotoMetadata {
        let mut meta = ExtractedPhotoMetadata {
            orientation: 1,
            ..Default::default()
        };

        let mut parser = MediaParser::new();
        let ms = match MediaSource::open(path.as_ref()) {
            Ok(ms) => ms,
            Err(_) => return meta,
        };

        if let Ok(iter) = parser.parse_exif(ms) {
            let exif: Exif = iter.into();
            Self::extract_from_exif(&exif, &mut meta);
        }

        meta
    }

    fn extract_from_exif(exif: &Exif, meta: &mut ExtractedPhotoMetadata) {
        // High-precision GPS parsing
        if let Some(gps) = exif.gps_info() {
            if let Some(lat) = gps.latitude.to_decimal_degrees() {
                meta.latitude = Some(lat * gps.latitude_ref.sign());
            }
            if let Some(lon) = gps.longitude.to_decimal_degrees() {
                meta.longitude = Some(lon * gps.longitude_ref.sign());
            }
            meta.altitude = gps.altitude.meters();
        }

        // Captured date & time
        if let Some(val) = exif.get(ExifTag::DateTimeOriginal).or_else(|| exif.get(ExifTag::CreateDate)) {
            match val {
                EntryValue::DateTime(dt) => {
                    meta.captured_at_local = Some(dt.to_rfc3339());
                    meta.captured_at = Some(dt.timestamp_millis());
                }
                EntryValue::NaiveDateTime(ndt) => {
                    meta.captured_at_local = Some(ndt.to_string());
                    meta.captured_at = Some(ndt.and_utc().timestamp_millis());
                }
                EntryValue::Text(s) => {
                    meta.captured_at_local = Some(s.clone());
                    if let Ok(ndt) = NaiveDateTime::parse_from_str(s, "%Y:%m:%d %H:%M:%S") {
                        meta.captured_at = Some(ndt.and_utc().timestamp_millis());
                    }
                }
                _ => {}
            }
        }

        // Orientation
        if let Some(val) = exif.get(ExifTag::Orientation) {
            if let EntryValue::U16(o) = val {
                meta.orientation = *o as u32;
            } else if let EntryValue::U32(o) = val {
                meta.orientation = *o;
            }
        }

        // Camera Make
        if let Some(val) = exif.get(ExifTag::Make) {
            if let Some(s) = val.as_str() {
                meta.camera_make = Some(s.trim().to_string());
            }
        }

        // Camera Model
        if let Some(val) = exif.get(ExifTag::Model) {
            if let Some(s) = val.as_str() {
                meta.camera_model = Some(s.trim().to_string());
            }
        }

        // Lens Model
        if let Some(val) = exif.get(ExifTag::LensModel) {
            if let Some(s) = val.as_str() {
                meta.lens_model = Some(s.trim().to_string());
            }
        }

        // Focal Length
        if let Some(val) = exif.get(ExifTag::FocalLength) {
            if let EntryValue::URational(r) = val {
                meta.focal_length = r.to_f64();
            }
        }

        // Aperture / FNumber
        if let Some(val) = exif.get(ExifTag::FNumber) {
            if let EntryValue::URational(r) = val {
                meta.aperture = r.to_f64();
            }
        }

        // ISO
        if let Some(val) = exif.get(ExifTag::ISOSpeedRatings) {
            if let EntryValue::U32(i) = val {
                meta.iso = Some(*i);
            } else if let EntryValue::U16(i) = val {
                meta.iso = Some(*i as u32);
            }
        }

        // Exposure Time
        if let Some(val) = exif.get(ExifTag::ExposureTime) {
            if let EntryValue::URational(r) = val {
                meta.exposure_time = Some(format!("{}/{}", r.numerator(), r.denominator()));
            }
        }

        // Dimensions
        if let Some(val) = exif.get(ExifTag::ImageWidth) {
            if let EntryValue::U32(w) = val {
                meta.width = Some(*w);
            } else if let EntryValue::U16(w) = val {
                meta.width = Some(*w as u32);
            }
        }
        if let Some(val) = exif.get(ExifTag::ImageHeight) {
            if let EntryValue::U32(h) = val {
                meta.height = Some(*h);
            } else if let EntryValue::U16(h) = val {
                meta.height = Some(*h as u32);
            }
        }
    }
}
