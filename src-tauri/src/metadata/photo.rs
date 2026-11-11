use std::path::Path;
use std::sync::OnceLock;
use chrono::{Datelike, NaiveDate, NaiveDateTime, Utc};
use nom_exif::{EntryValue, Exif, ExifTag, MediaParser, MediaSource};
use regex::Regex;

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

/// Parses a date string tolerantly, stripping null bytes and whitespace, and supporting
/// standard EXIF formats, ISO 8601 with or without 'T', timezones, subseconds, and date-only forms.
pub fn parse_tolerant_date_str(s: &str) -> Option<(i64, String)> {
    let cleaned = s.trim_matches(|c: char| c.is_whitespace() || c == '\0');
    if cleaned.is_empty() {
        return None;
    }

    // 1. Try RFC 3339 / ISO 8601 with timezone (e.g. "2023-05-14T15:23:45+02:00", "2023-05-14T15:23:45Z")
    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(cleaned) {
        let year = dt.year();
        if (1970..=2100).contains(&year) {
            return Some((dt.timestamp_millis(), dt.to_rfc3339()));
        }
    }

    // 2. Try formats with timezone offset, e.g. "2023:05:14 15:23:45+02:00"
    let tz_formats = [
        "%Y:%m:%d %H:%M:%S%:z",
        "%Y:%m:%d %H:%M:%S %:z",
        "%Y-%m-%d %H:%M:%S%:z",
        "%Y-%m-%d %H:%M:%S %:z",
        "%Y-%m-%dT%H:%M:%S%:z",
    ];
    for fmt in tz_formats {
        if let Ok(dt) = chrono::DateTime::parse_from_str(cleaned, fmt) {
            let year = dt.year();
            if (1970..=2100).contains(&year) {
                return Some((dt.timestamp_millis(), dt.to_rfc3339()));
            }
        }
    }

    // 3. Try NaiveDateTime formats (standard EXIF colons, ISO dashes, slashes, subseconds)
    let naive_formats = [
        "%Y:%m:%d %H:%M:%S",
        "%Y:%m:%d %H:%M:%S%.f",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M:%S%.f",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%dT%H:%M:%S%.f",
        "%Y/%m/%d %H:%M:%S",
        "%Y/%m/%d %H:%M:%S%.f",
        "%Y:%m:%d %H.%M.%S",
        "%Y-%m-%d %H.%M.%S",
    ];
    for fmt in naive_formats {
        if let Ok(ndt) = NaiveDateTime::parse_from_str(cleaned, fmt) {
            let year = ndt.year();
            if (1970..=2100).contains(&year) {
                return Some((ndt.and_utc().timestamp_millis(), ndt.to_string()));
            }
        }
    }

    // 4. Try date-only formats, e.g. "2023:05:14", "2023-05-14", "2023/05/14"
    let date_formats = ["%Y:%m:%d", "%Y-%m-%d", "%Y/%m/%d"];
    for fmt in date_formats {
        if let Ok(nd) = NaiveDate::parse_from_str(cleaned, fmt) {
            let year = nd.year();
            if (1970..=2100).contains(&year) {
                if let Some(ndt) = nd.and_hms_opt(12, 0, 0) {
                    return Some((ndt.and_utc().timestamp_millis(), ndt.to_string()));
                }
            }
        }
    }

    None
}

/// Fallback date extractor from common filename naming conventions.
/// Supports WhatsApp, Android camera (IMG/VID), Google Pixel (PXL), Screenshots, and ISO date prefixes.
pub fn extract_date_from_filename(filename: &str) -> Option<(i64, String)> {
    static RE_WHATSAPP: OnceLock<Regex> = OnceLock::new();
    static RE_DATETIME_UNDERSCORE: OnceLock<Regex> = OnceLock::new();
    static RE_DATETIME_ISO: OnceLock<Regex> = OnceLock::new();
    static RE_DATE_COMPACT_WA: OnceLock<Regex> = OnceLock::new();
    static RE_DATE_ISO: OnceLock<Regex> = OnceLock::new();
    static RE_DATE_COMPACT: OnceLock<Regex> = OnceLock::new();

    let re_wa = RE_WHATSAPP.get_or_init(|| {
        Regex::new(r"(?i)WhatsApp (?:Image|Video) (\d{4})-(\d{2})-(\d{2}) at (\d{1,2})[\.:](\d{2})[\.:](\d{2})")
            .expect("Valid regex")
    });
    let re_dt_under = RE_DATETIME_UNDERSCORE.get_or_init(|| {
        Regex::new(r"(?i)(?:IMG|VID|PXL|Screenshot|PHOTO|PIC|MOV|REC)?[-_ ]*(\d{4})(\d{2})(\d{2})[-_ ]+(\d{2})(\d{2})(\d{2})")
            .expect("Valid regex")
    });
    let re_dt_iso = RE_DATETIME_ISO.get_or_init(|| {
        Regex::new(r"(\d{4})[-_](\d{2})[-_](\d{2})[-_ T]+(\d{2})[-_:\.](\d{2})[-_:\.](\d{2})")
            .expect("Valid regex")
    });
    let re_wa_compact = RE_DATE_COMPACT_WA.get_or_init(|| {
        Regex::new(r"(?i)(?:IMG|VID)[-_](\d{4})(\d{2})(\d{2})[-_]WA")
            .expect("Valid regex")
    });
    let re_iso = RE_DATE_ISO.get_or_init(|| {
        Regex::new(r"(?:^|[^\d])(\d{4})[-_](\d{2})[-_](\d{2})(?:[^\d]|$)")
            .expect("Valid regex")
    });
    let re_compact = RE_DATE_COMPACT.get_or_init(|| {
        Regex::new(r"(?:^|[^\d])(199\d|20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])(?:[^\d]|$)")
            .expect("Valid regex")
    });

    let current_year = Utc::now().year();

    let validate_and_build = |y: i32, m: u32, d: u32, h: u32, min: u32, s: u32| -> Option<(i64, String)> {
        if y < 1990 || y > current_year {
            return None;
        }
        let date = NaiveDate::from_ymd_opt(y, m, d)?;
        let dt = date.and_hms_opt(h.min(23), min.min(59), s.min(59))?;
        let ms = dt.and_utc().timestamp_millis();
        let local = dt.to_string();
        Some((ms, local))
    };

    // 1. WhatsApp with explicit timestamp: "WhatsApp Image 2023-05-14 at 15.23.45.jpeg"
    if let Some(caps) = re_wa.captures(filename) {
        if let (Ok(y), Ok(m), Ok(d), Ok(h), Ok(min), Ok(s)) = (
            caps[1].parse::<i32>(),
            caps[2].parse::<u32>(),
            caps[3].parse::<u32>(),
            caps[4].parse::<u32>(),
            caps[5].parse::<u32>(),
            caps[6].parse::<u32>(),
        ) {
            if let Some(res) = validate_and_build(y, m, d, h, min, s) {
                return Some(res);
            }
        }
    }

    // 2. Standard camera format: IMG_20230514_152345, VID_20230514_152345, PXL_20230514_152345123
    if let Some(caps) = re_dt_under.captures(filename) {
        if let (Ok(y), Ok(m), Ok(d), Ok(h), Ok(min), Ok(s)) = (
            caps[1].parse::<i32>(),
            caps[2].parse::<u32>(),
            caps[3].parse::<u32>(),
            caps[4].parse::<u32>(),
            caps[5].parse::<u32>(),
            caps[6].parse::<u32>(),
        ) {
            if let Some(res) = validate_and_build(y, m, d, h, min, s) {
                return Some(res);
            }
        }
    }

    // 3. ISO format with time: 2023-05-14 15.23.45, Screenshot_2023-05-14-15-23-45
    if let Some(caps) = re_dt_iso.captures(filename) {
        if let (Ok(y), Ok(m), Ok(d), Ok(h), Ok(min), Ok(s)) = (
            caps[1].parse::<i32>(),
            caps[2].parse::<u32>(),
            caps[3].parse::<u32>(),
            caps[4].parse::<u32>(),
            caps[5].parse::<u32>(),
            caps[6].parse::<u32>(),
        ) {
            if let Some(res) = validate_and_build(y, m, d, h, min, s) {
                return Some(res);
            }
        }
    }

    // 4. WhatsApp compact format: IMG-20230514-WA0001
    if let Some(caps) = re_wa_compact.captures(filename) {
        if let (Ok(y), Ok(m), Ok(d)) = (
            caps[1].parse::<i32>(),
            caps[2].parse::<u32>(),
            caps[3].parse::<u32>(),
        ) {
            if let Some(res) = validate_and_build(y, m, d, 12, 0, 0) {
                return Some(res);
            }
        }
    }

    // 5. ISO date only: 2023-05-14
    if let Some(caps) = re_iso.captures(filename) {
        if let (Ok(y), Ok(m), Ok(d)) = (
            caps[1].parse::<i32>(),
            caps[2].parse::<u32>(),
            caps[3].parse::<u32>(),
        ) {
            if let Some(res) = validate_and_build(y, m, d, 12, 0, 0) {
                return Some(res);
            }
        }
    }

    // 6. Compact YYYYMMDD date: Screenshot_20230514
    if let Some(caps) = re_compact.captures(filename) {
        if let (Ok(y), Ok(m), Ok(d)) = (
            caps[1].parse::<i32>(),
            caps[2].parse::<u32>(),
            caps[3].parse::<u32>(),
        ) {
            if let Some(res) = validate_and_build(y, m, d, 12, 0, 0) {
                return Some(res);
            }
        }
    }

    // 7. Unix millisecond epoch timestamps (13 digits starting with 1, e.g. FB_IMG_1426625621638, 1388427113062)
    static RE_EPOCH_MS: OnceLock<Regex> = OnceLock::new();
    let re_epoch_ms = RE_EPOCH_MS.get_or_init(|| {
        Regex::new(r"(?:^|[^\d])(1[2-7]\d{11})(?:[^\d]|$)").expect("Valid regex")
    });
    if let Some(caps) = re_epoch_ms.captures(filename) {
        if let Ok(ms) = caps[1].parse::<i64>() {
            let secs = ms / 1000;
            if let Some(dt) = chrono::DateTime::from_timestamp(secs, 0) {
                let year = dt.year();
                let current_year = Utc::now().year();
                if (2000..=current_year).contains(&year) {
                    return Some((ms, dt.naive_utc().to_string()));
                }
            }
        }
    }

    // 8. Note DDMMYY_HHMMSS (e.g. Note_261213_194757)
    static RE_NOTE: OnceLock<Regex> = OnceLock::new();
    let re_note = RE_NOTE.get_or_init(|| {
        Regex::new(r"Note_(\d{2})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})").expect("Valid regex")
    });
    if let Some(caps) = re_note.captures(filename) {
        if let (Ok(d), Ok(m), Ok(yy), Ok(h), Ok(min), Ok(s)) = (
            caps[1].parse::<u32>(),
            caps[2].parse::<u32>(),
            caps[3].parse::<i32>(),
            caps[4].parse::<u32>(),
            caps[5].parse::<u32>(),
            caps[6].parse::<u32>(),
        ) {
            let y = 2000 + yy;
            if let Some(res) = validate_and_build(y, m, d, h, min, s) {
                return Some(res);
            }
        }
    }

    None
}

/// Parses Google Photos Takeout metadata JSON sidecar if present.
/// Supports standard `<media_path>.json`, `<stem>.json`, Google Takeout duplicate naming
/// `<name>.<ext>(1).json` for `<name>(1).<ext>`, and `-edited` suffixes.
pub fn try_parse_google_takeout_sidecar<P: AsRef<Path>>(media_path: P) -> Option<(i64, String)> {
    use std::fs::File;
    use std::io::Read;
    use std::path::PathBuf;

    let path = media_path.as_ref();
    let parent = path.parent()?;
    let filename = path.file_name()?.to_str()?;

    let mut candidates: Vec<PathBuf> = Vec::with_capacity(6);
    // 1. Exact: file.ext.json
    candidates.push(parent.join(format!("{}.json", filename)));
    // 2. Stem: file.json
    candidates.push(path.with_extension("json"));

    // 3. Google Takeout duplicate format: file(1).ext -> file.ext(1).json & file(1).ext.json
    static RE_DUP: OnceLock<Regex> = OnceLock::new();
    let re_dup = RE_DUP.get_or_init(|| {
        Regex::new(r"^(.*?)\((\d+)\)\.([a-zA-Z0-9]+)$").expect("Valid regex")
    });
    if let Some(caps) = re_dup.captures(filename) {
        let base = &caps[1];
        let num = &caps[2];
        let ext = &caps[3];
        candidates.push(parent.join(format!("{}.{}({}).json", base, ext, num)));
        candidates.push(parent.join(format!("{}({}).{}.json", base, num, ext)));
    }

    // 4. Google Takeout edited format: file-edited.ext -> file.ext.json & file.json
    if filename.contains("-edited") {
        let clean = filename.replace("-edited", "");
        candidates.push(parent.join(format!("{}.json", clean)));
        if let Some(clean_stem) = Path::new(&clean).file_stem().and_then(|s| s.to_str()) {
            candidates.push(parent.join(format!("{}.json", clean_stem)));
            if let Some(clean_ext) = Path::new(&clean).extension().and_then(|s| s.to_str()) {
                candidates.push(parent.join(format!("{}.{}.json", clean_stem, clean_ext)));
            }
        }
    }

    let json_path = candidates.into_iter().find(|p| p.exists() && p != path)?;

    let mut file = File::open(&json_path).ok()?;
    let mut contents = String::new();
    file.read_to_string(&mut contents).ok()?;

    let v: serde_json::Value = serde_json::from_str(&contents).ok()?;
    let ts_str = v.get("photoTakenTime")
        .and_then(|t| t.get("timestamp"))
        .and_then(|ts| ts.as_str())
        .or_else(|| {
            v.get("creationTime")
                .and_then(|t| t.get("timestamp"))
                .and_then(|ts| ts.as_str())
        })?;
    let secs = ts_str.parse::<i64>().ok()?;
    let ms = secs * 1000;

    let dt = chrono::DateTime::from_timestamp(secs, 0)?;
    let year = dt.year();
    let current_year = Utc::now().year();
    if (1990..=current_year).contains(&year) {
        Some((ms, dt.naive_utc().to_string()))
    } else {
        None
    }
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
        if let Ok(ms) = MediaSource::open(path.as_ref()) {
            if let Ok(iter) = parser.parse_exif(ms) {
                let exif: Exif = iter.into();
                Self::extract_from_exif(&exif, &mut meta);
            }
        }

        // Fallback 1: If EXIF date was not found, attempt extracting date from filename
        if meta.captured_at.is_none() {
            if let Some(file_name) = path.as_ref().file_name().and_then(|s| s.to_str()) {
                if let Some((ts, local)) = extract_date_from_filename(file_name) {
                    meta.captured_at = Some(ts);
                    meta.captured_at_local = Some(local);
                }
            }
        }

        // Fallback 2: Check for Google Takeout JSON sidecar
        if meta.captured_at.is_none() {
            if let Some((ts, local)) = try_parse_google_takeout_sidecar(path.as_ref()) {
                meta.captured_at = Some(ts);
                meta.captured_at_local = Some(local);
            }
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

        // Captured date & time: check DateTimeOriginal, then CreateDate, then ModifyDate (TIFF 0x0132)
        if let Some(val) = exif
            .get(ExifTag::DateTimeOriginal)
            .or_else(|| exif.get(ExifTag::CreateDate))
            .or_else(|| exif.get(ExifTag::ModifyDate))
        {
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
                    if let Some((ts, local)) = parse_tolerant_date_str(s) {
                        meta.captured_at = Some(ts);
                        meta.captured_at_local = Some(local);
                    } else {
                        meta.captured_at_local = Some(
                            s.trim_matches(|c: char| c.is_whitespace() || c == '\0').to_string(),
                        );
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_date_from_various_filenames() {
        // WhatsApp Image
        let res = extract_date_from_filename("WhatsApp Image 2023-05-14 at 15.23.45.jpeg");
        assert!(res.is_some(), "WhatsApp image parsing failed");
        let (_, local) = res.unwrap();
        assert_eq!(local, "2023-05-14 15:23:45");

        // WhatsApp Video
        let res = extract_date_from_filename("WhatsApp Video 2024-07-28 at 18.05.10.mp4");
        assert!(res.is_some(), "WhatsApp video parsing failed");
        let (_, local) = res.unwrap();
        assert_eq!(local, "2024-07-28 18:05:10");

        // Android IMG
        let res = extract_date_from_filename("IMG_20240725_143022.jpg");
        assert!(res.is_some(), "IMG underscore parsing failed");
        let (_, local) = res.unwrap();
        assert_eq!(local, "2024-07-25 14:30:22");

        // Android VID
        let res = extract_date_from_filename("VID_20220101_000530.mp4");
        assert!(res.is_some(), "VID underscore parsing failed");
        let (_, local) = res.unwrap();
        assert_eq!(local, "2022-01-01 00:05:30");

        // Google Pixel
        let res = extract_date_from_filename("PXL_20211105_143022123.jpg");
        assert!(res.is_some(), "PXL parsing failed");
        let (_, local) = res.unwrap();
        assert_eq!(local, "2021-11-05 14:30:22");

        // Screenshots
        let res = extract_date_from_filename("Screenshot_20230514-152345_Photos.jpg");
        assert!(res.is_some(), "Screenshot compact parsing failed");
        let (_, local) = res.unwrap();
        assert_eq!(local, "2023-05-14 15:23:45");

        let res = extract_date_from_filename("Screenshot_2023-05-14-15-23-45.png");
        assert!(res.is_some(), "Screenshot ISO parsing failed");
        let (_, local) = res.unwrap();
        assert_eq!(local, "2023-05-14 15:23:45");

        // WhatsApp WA format
        let res = extract_date_from_filename("IMG-20230514-WA0001.jpg");
        assert!(res.is_some(), "WA compact parsing failed");
        let (_, local) = res.unwrap();
        assert!(local.starts_with("2023-05-14"));

        // ISO format with spaces
        let res = extract_date_from_filename("2023-05-14 15.23.45.jpg");
        assert!(res.is_some(), "ISO with space parsing failed");
        let (_, local) = res.unwrap();
        assert_eq!(local, "2023-05-14 15:23:45");

        // Simple date
        let res = extract_date_from_filename("Trip_2021-08-20.jpg");
        assert!(res.is_some(), "Trip date parsing failed");
        let (_, local) = res.unwrap();
        assert!(local.starts_with("2021-08-20"));

        // Out of bounds / invalid dates
        assert!(extract_date_from_filename("IMG_19850101_120000.jpg").is_none()); // Before 1990
        assert!(extract_date_from_filename("random_file_name.jpg").is_none());
        assert!(extract_date_from_filename("IMG_20230231_120000.jpg").is_none()); // Feb 31 invalid
    }

    #[test]
    fn test_tolerant_exif_date_parser() {
        // Standard EXIF with null byte and spaces
        let res = parse_tolerant_date_str("2023:08:15 14:30:00\0 ");
        assert!(res.is_some());
        let (_, local) = res.unwrap();
        assert_eq!(local, "2023-08-15 14:30:00");

        // ISO format
        let res = parse_tolerant_date_str("2023-08-15 14:30:00");
        assert!(res.is_some());

        // ISO 8601 with T and timezone
        let res = parse_tolerant_date_str("2023-08-15T14:30:00+02:00");
        assert!(res.is_some());

        // Subseconds
        let res = parse_tolerant_date_str("2023:08:15 14:30:00.123");
        assert!(res.is_some());

        // Date only
        let res = parse_tolerant_date_str("2023:08:15");
        assert!(res.is_some());
        let (_, local) = res.unwrap();
        assert!(local.starts_with("2023-08-15"));

        // Invalid
        assert!(parse_tolerant_date_str("").is_none());
        assert!(parse_tolerant_date_str("not a date").is_none());
    }
}
