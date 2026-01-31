use std::collections::HashMap;

/// High-performance spatial grid for O(k) nearest-neighbor queries
/// 
/// Uses a uniform grid to partition 3D space
/// Each cell contains units within that region
#[derive(Debug, Clone)]
pub struct SpatialGrid {
    cell_size: f32,
    inv_cell_size: f32,
    cells: HashMap<(i32, i32, i32), Vec<usize>>, // Key: cell coords, Value: unit indices
}

impl SpatialGrid {
    pub fn new(cell_size: f32) -> Self {
        Self {
            cell_size,
            inv_cell_size: 1.0 / cell_size,
            cells: HashMap::new(),
        }
    }

    /// Get cell key for position - INLINE for speed
    #[inline]
    fn get_key(&self, x: f32, y: f32, z: f32) -> (i32, i32, i32) {
        (
            (x * self.inv_cell_size).floor() as i32,
            (y * self.inv_cell_size).floor() as i32,
            (z * self.inv_cell_size).floor() as i32,
        )
    }

    /// Insert unit into grid - O(1)
    pub fn insert(&mut self, index: usize, x: f32, y: f32, z: f32) {
        let key = self.get_key(x, y, z);
        self.cells.entry(key).or_insert_with(Vec::new).push(index);
    }

    /// Get nearby unit indices - O(k) where k = units in nearby cells
    ///
    /// Dynamically expands search radius based on range parameter
    pub fn get_nearby(&self, x: f32, y: f32, z: f32, range: f32) -> Vec<usize> {
        let (cx, cy, cz) = self.get_key(x, y, z);
        let mut result = Vec::new();

        // Calculate how many cells to search based on range
        // Add 1 to ensure we cover edge cases
        let cells_needed = ((range * self.inv_cell_size).ceil() as i32).max(1);

        for dx in -cells_needed..=cells_needed {
            for dy in -cells_needed..=cells_needed {
                for dz in -cells_needed..=cells_needed {
                    let key = (cx + dx, cy + dy, cz + dz);

                    if let Some(cell) = self.cells.get(&key) {
                        for &idx in cell {
                            result.push(idx);
                        }
                    }
                }
            }
        }

        result
    }

    /// Clear all cells - O(1) (just creates new HashMap)
    pub fn clear(&mut self) {
        self.cells.clear();
    }

    /// Get statistics
    pub fn stats(&self) -> (usize, usize) {
        let total_units: usize = self.cells.values().map(|v| v.len()).sum();
        (self.cells.len(), total_units)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_spatial_grid() {
        let mut grid = SpatialGrid::new(1000.0);
        
        // Insert units
        grid.insert(0, 500.0, 500.0, 0.0);
        grid.insert(1, 600.0, 600.0, 0.0);
        grid.insert(2, 5000.0, 5000.0, 0.0);
        
        // Query nearby
        let nearby = grid.get_nearby(500.0, 500.0, 0.0, 200.0);
        
        assert!(nearby.contains(&0));
        assert!(nearby.contains(&1));
        assert!(!nearby.contains(&2));
    }
}
