use std::fs::File;
use std::io::BufReader;
use std::path::Path;
use chrono::{NaiveDateTime, TimeZone, Utc};
use nom_exif::{ExifIter, ExifTag, MediaParser, MediaSource, ParsedExifValue};

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

        let file = match File::open(path.as_ref()) {
            Ok(f) => f,
            Err(_) => return meta,
        };

        let reader = BufReader::new(file);
        let mut parser = MediaParser::new();

        let ms = match MediaSource::seekable(reader) {
            Ok(ms) => ms,
            Err(_) => return meta,
        };

        if let Ok(iter) = parser.parse(ms) {
            Self::extract_from_iter(iter, &mut meta);
        }

        meta
    }

    fn extract_from_iter(iter: ExifIter, meta: &mut ExtractedPhotoMetadata) {
        for entry in iter {
            let tag = entry.tag();
            let val = entry.value();

            match tag {
                Some(ExifTag::DateTimeOriginal) | Some(ExifTag::CreateDate) => {
                    if meta.captured_at.is_none() {
                        if let ParsedExifValue::Time(t) = val {
                            let dt_str = t.to_rfc3339();
                            meta.captured_at_local = Some(dt_str);
                            meta.captured_at = Some(t.timestamp_millis());
                        } else if let ParsedExifValue::String(s) = val {
                            meta.captured_at_local = Some(s.clone());
                            if let Ok(ndt) = NaiveDateTime::parse_from_str(s, "%Y:%m:%d %H:%M:%S") {
                                meta.captured_at = Some(Utc.from_utc_datetime(&ndt).timestamp_millis());
                            }
                        }
                    }
                }
                Some(ExifTag::GpsLatitude) => {
                    if let ParsedExifValue::GpsCoord(coord) = val {
                        meta.latitude = Some(coord.0);
                    }
                }
                Some(ExifTag::GpsLongitude) => {
                    if let ParsedExifValue::GpsCoord(coord) = val {
                        meta.longitude = Some(coord.0);
                    }
                }
                Some(ExifTag::GpsAltitude) => {
                    if let ParsedExifValue::Rational(r) = val {
                        meta.altitude = Some(r.to_f64());
                    }
                }
                Some(ExifTag::Orientation) => {
                    if let ParsedExifValue::U16(o) = val {
                        meta.orientation = *o as u32;
                    } else if let ParsedExifValue::U32(o) = val {
                        meta.orientation = *o;
                    }
                }
                Some(ExifTag::Make) => {
                    if let ParsedExifValue::String(s) = val {
                        meta.camera_make = Some(s.trim().to_string());
                    }
                }
                Some(ExifTag::Model) => {
                    if let ParsedExifValue::String(s) = val {
                        meta.camera_model = Some(s.trim().to_string());
                    }
                }
                Some(ExifTag::LensModel) => {
                    if let ParsedExifValue::String(s) = val {
                        meta.lens_model = Some(s.trim().to_string());
                    }
                }
                Some(ExifTag::FocalLength) => {
                    if let ParsedExifValue::Rational(r) = val {
                        meta.focal_length = Some(r.to_f64());
                    }
                }
                Some(ExifTag::FNumber) => {
                    if let ParsedExifValue::Rational(r) = val {
                        meta.aperture = Some(r.to_f64());
                    }
                }
                Some(ExifTag::IsoSpeedRatings) => {
                    if let ParsedExifValue::U32(i) = val {
                        meta.iso = Some(*i);
                    } else if let ParsedExifValue::U16(i) = val {
                        meta.iso = Some(*i as u32);
                    }
                }
                Some(ExifTag::ExposureTime) => {
                    if let ParsedExifValue::Rational(r) = val {
                        meta.exposure_time = Some(format!("{}/{}", r.numer(), r.denom()));
                    }
                }
                Some(ExifTag::ImageWidth) => {
                    if let ParsedExifValue::U32(w) = val {
                        meta.width = Some(*w);
                    }
                }
                Some(ExifTag::ImageHeight) => {
                    if let ParsedExifValue::U32(h) = val {
                        meta.height = Some(*h);
                    }
                }
                _ => {}
            }
        }
    }
}
