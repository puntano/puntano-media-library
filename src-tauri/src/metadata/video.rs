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
            let end_lon = remainder[1..]
                .find(|c| c == '+' || c == '-' || c == '/')
                .map(|idx| idx + 1)
                .unwrap_or(remainder.len());
            let lon_str = &remainder[0..end_lon];

            if let (Ok(lat), Ok(lon)) = (lat_str.parse::<f64>(), lon_str.parse::<f64>()) {
                return Some((lat, lon));
            }
        }

        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_iso6709_coordinates() {
        let res = VideoMetadataParser::parse_iso6709("+34.0522-118.2437/");
        assert!(res.is_some());
        let (lat, lon) = res.unwrap();
        assert!((lat - 34.0522).abs() < 1e-4);
        assert!((lon - (-118.2437)).abs() < 1e-4);

        let res2 = VideoMetadataParser::parse_iso6709("+51.5074-000.1278+015.000/");
        assert!(res2.is_some());
        let (lat2, lon2) = res2.unwrap();
        assert!((lat2 - 51.5074).abs() < 1e-4);
        assert!((lon2 - (-0.1278)).abs() < 1e-4);

        let invalid = VideoMetadataParser::parse_iso6709("invalid_non_coordinates");
        assert!(invalid.is_none());
    }
}
