use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;
use chrono::NaiveDateTime;
use nom_exif::{EntryValue, MediaParser, MediaSource, TrackInfo, TrackInfoTag};

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

        let mut parser = MediaParser::new();
        if let Ok(ms) = MediaSource::open(path.as_ref()) {
            if let Ok(track) = parser.parse_track(ms) {
                Self::extract_from_track(&track, &mut meta);
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

    fn extract_from_track(track: &TrackInfo, meta: &mut ExtractedVideoMetadata) {
        if let Some(gps) = track.gps_info() {
            if let Some(lat) = gps.latitude.to_decimal_degrees() {
                meta.latitude = Some(lat * gps.latitude_ref.sign());
            }
            if let Some(lon) = gps.longitude.to_decimal_degrees() {
                meta.longitude = Some(lon * gps.longitude_ref.sign());
            }
            meta.altitude = gps.altitude.meters();
        }

        if let Some(val) = track.get(TrackInfoTag::CreateDate) {
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

        if let Some(val) = track.get(TrackInfoTag::DurationMs) {
            if let EntryValue::U64(ms) = val {
                meta.duration = Some(*ms as f64 / 1000.0);
            } else if let EntryValue::U32(ms) = val {
                meta.duration = Some(*ms as f64 / 1000.0);
            }
        }

        if let Some(val) = track.get(TrackInfoTag::Width) {
            if let EntryValue::U32(w) = val {
                meta.width = Some(*w);
            }
        }

        if let Some(val) = track.get(TrackInfoTag::Height) {
            if let EntryValue::U32(h) = val {
                meta.height = Some(*h);
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
