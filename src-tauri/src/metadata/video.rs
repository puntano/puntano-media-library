use std::fs::File;
use std::io::{BufReader, Read, Seek, SeekFrom};
use std::path::Path;
use chrono::{NaiveDateTime, TimeZone, Utc};
use nom_exif::{ExifIter, ExifTag, MediaParser, MediaSource, ParsedExifValue};

#[derive(Default, Debug)]
pub struct ExtractedVideoMetadata {
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub duration: Option<f64>,
    pub captured_at: Option<i64>,
    pub captured_at_local: Option<String>,
    pub latitude: Option<f64>,
    pub longitude: Option<f64>,
    pub altitude: Option<f64>,
}

pub struct VideoMetadataParser;

impl VideoMetadataParser {
    /// Non-blocking video metadata parsing: inspects ISO BMFF / QuickTime container atoms.
    pub fn parse<P: AsRef<Path>>(path: P) -> ExtractedVideoMetadata {
        let mut meta = ExtractedVideoMetadata::default();

        let file = match File::open(path.as_ref()) {
            Ok(f) => f,
            Err(_) => return meta,
        };

        let reader = BufReader::new(file);
        let mut parser = MediaParser::new();

        if let Ok(ms) = MediaSource::seekable(reader) {
            if let Ok(iter) = parser.parse(ms) {
                Self::extract_from_iter(iter, &mut meta);
            }
        }

        // Fallback: If nom-exif didn't catch ISO 6709 location or mvhd creation date, scan QuickTime atoms
        if meta.captured_at.is_none() || meta.latitude.is_none() {
            if let Ok(mut f) = File::open(path.as_ref()) {
                Self::scan_quicktime_atoms(&mut f, &mut meta);
            }
        }

        meta
    }

    fn extract_from_iter(iter: ExifIter, meta: &mut ExtractedVideoMetadata) {
        for entry in iter {
            let tag = entry.tag();
            let val = entry.value();

            match tag {
                Some(ExifTag::CreateDate) | Some(ExifTag::DateTimeOriginal) => {
                    if meta.captured_at.is_none() {
                        if let ParsedExifValue::Time(t) = val {
                            meta.captured_at_local = Some(t.to_rfc3339());
                            meta.captured_at = Some(t.timestamp_millis());
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
                Some(ExifTag::Duration) => {
                    if let ParsedExifValue::Rational(r) = val {
                        meta.duration = Some(r.to_f64());
                    }
                }
                _ => {}
            }
        }
    }

    /// Fast scan for MP4/MOV ISO 6709 location atom (©xyz / xyz)
    /// Format e.g.: "+34.0522-118.2437+100.000/"
    fn scan_quicktime_atoms(file: &mut File, meta: &mut ExtractedVideoMetadata) {
        let mut buffer = [0u8; 8192];
        if file.seek(SeekFrom::Start(0)).is_err() {
            return;
        }

        // Search the first 512KB for common location atom signatures
        let mut total_read = 0;
        while total_read < 524288 {
            let read_bytes = match file.read(&mut buffer) {
                Ok(n) if n > 0 => n,
                _ => break,
            };

            // Search for ©xyz or xyz atom marker
            for i in 0..read_bytes.saturating_sub(16) {
                if (&buffer[i..i+4] == b"\xa9xyz" || &buffer[i..i+3] == b"xyz") && meta.latitude.is_none() {
                    // QuickTime ISO 6709 coordinates string follows
                    if let Ok(text) = std::str::from_utf8(&buffer[i+4..i+32.min(read_bytes)]) {
                        if let Some((lat, lon)) = Self::parse_iso6709(text) {
                            meta.latitude = Some(lat);
                            meta.longitude = Some(lon);
                            break;
                        }
                    }
                }
            }

            total_read += read_bytes;
        }
    }

    fn parse_iso6709(s: &str) -> Option<(f64, f64)> {
        // Typical string: "+34.0522-118.2437+100/" or "+34.0522-118.2437/"
        let trimmed = s.trim_matches(|c: char| !c.is_ascii_digit() && c != '+' && c != '-');
        let mut signs = Vec::new();
        for (idx, ch) in trimmed.char_indices() {
            if (ch == '+' || ch == '-') && idx > 0 {
                signs.push(idx);
            }
        }

        if !signs.is_empty() {
            let lat_str = &trimmed[0..signs[0]];
            let remainder = &trimmed[signs[0]..];
            let end_lon = remainder.find(|c| c == '+' || c == '-' || c == '/').unwrap_or(remainder.len());
            let lon_str = &remainder[0..end_lon];

            if let (Ok(lat), Ok(lon)) = (lat_str.parse::<f64>(), lon_str.parse::<f64>()) {
                return Some((lat, lon));
            }
        }

        None
    }
}
