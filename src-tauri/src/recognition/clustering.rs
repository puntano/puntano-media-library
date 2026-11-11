use super::engine::FaceEngine;

pub struct FaceRecord {
    pub id: i64,
    pub media_id: i64,
    pub person_id: Option<i64>,
    pub bbox_x: f32,
    pub bbox_y: f32,
    pub bbox_w: f32,
    pub bbox_h: f32,
    pub confidence: f32,
    pub embedding: [f32; 128],
}

pub struct PersonCentroid {
    pub person_id: i64,
    pub embedding: [f32; 128],
    pub face_count: usize,
}

pub struct FaceClusterer {
    pub match_threshold: f32, // typically 0.65 for MobileFaceNet
}

impl FaceClusterer {
    pub fn new(threshold: f32) -> Self {
        Self {
            match_threshold: threshold,
        }
    }

    /// Match an embedding against existing person centroids. Returns person_id if similarity >= match_threshold.
    pub fn match_person(&self, embedding: &[f32; 128], centroids: &[PersonCentroid]) -> Option<i64> {
        let mut best_sim = -1.0f32;
        let mut best_person_id = None;

        for centroid in centroids {
            let sim = FaceEngine::cosine_similarity(embedding, &centroid.embedding);
            if sim > best_sim && sim >= self.match_threshold {
                best_sim = sim;
                best_person_id = Some(centroid.person_id);
            }
        }

        best_person_id
    }

    /// Cluster unassigned faces into groups of the same person.
    pub fn cluster_unassigned(&self, faces: Vec<FaceRecord>) -> Vec<Vec<FaceRecord>> {
        let mut clusters: Vec<Vec<FaceRecord>> = Vec::new();

        for face in faces {
            let mut matched_cluster_idx = None;
            let mut highest_sim = -1.0f32;

            for (idx, cluster) in clusters.iter().enumerate() {
                // Check similarity against average or exemplar in cluster
                for member in cluster {
                    let sim = FaceEngine::cosine_similarity(&face.embedding, &member.embedding);
                    if sim > highest_sim && sim >= self.match_threshold {
                        highest_sim = sim;
                        matched_cluster_idx = Some(idx);
                    }
                }
            }

            if let Some(idx) = matched_cluster_idx {
                clusters[idx].push(face);
            } else {
                clusters.push(vec![face]);
            }
        }

        clusters
    }
}
