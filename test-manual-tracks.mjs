// Manual track builder to test alignment
// This constructs simple 3-4 piece tracks step-by-step to identify misalignment

const TILE = 4;
const HEADING_DELTA = [
  { dx: 0, dz: -TILE },  // 0 = North (-Z)
  { dx: -TILE, dz: 0 },  // 1 = West (-X)
  { dx: 0, dz: TILE },   // 2 = South (+Z)
  { dx: TILE, dz: 0 },   // 3 = East (+X)
];

function buildTrackManually(scenario) {
  console.log(`\n=== Scenario: ${scenario} ===\n`);
  
  const pieces = [];
  let x = 0, y = 0, z = 0, heading = 0;
  
  const placePiece = (name, footprint) => {
    pieces.push({ name, x, y, z, heading, footprint });
    console.log(`#${pieces.length - 1}: ${name.padEnd(15)} @ (${x},${y},${z}) heading=${heading}`);
    if (footprint) {
      const cells = footprint.map(c => `(${x+c.dx},${y+c.yMin}-${c.yMax},${z+c.dz})`).join(", ");
      console.log(`           occupies: ${cells}`);
    }
  };
  
  const moveForward = (tiles = 1) => {
    const delta = HEADING_DELTA[heading];
    x += delta.dx * tiles;
    z += delta.dz * tiles;
  };
  
  const turnRight = () => heading = (heading + 3) % 4; // TurnRight: heading + 3 mod 4
  const turnLeft = () => heading = (heading + 1) % 4;  // TurnLeft: heading + 1 mod 4
  
  if (scenario === "start-straight-straight") {
    // Start @ (0,0,0) heading north(0)
    placePiece("Start", [{ dx: 0, dz: 0, yMin: 0, yMax: 0 }]);
    moveForward(1);
    
    // Straight @ (0,0,-4)
    placePiece("Straight", [{ dx: 0, dz: 0, yMin: 0, yMax: 0 }]);
    moveForward(1);
    
    // Straight @ (0,0,-8)
    placePiece("Straight", [{ dx: 0, dz: 0, yMin: 0, yMax: 0 }]);
    moveForward(1);
    console.log(`Final: (${x},${y},${z}) heading=${heading}`);
  }
  
  else if (scenario === "start-straight-turnshort") {
    placePiece("Start", [{ dx: 0, dz: 0, yMin: 0, yMax: 0 }]);
    moveForward(1);
    
    placePiece("Straight", [{ dx: 0, dz: 0, yMin: 0, yMax: 0 }]);
    moveForward(1);
    
    // TurnShort (1x1 footprint, turns right)
    placePiece("TurnShort", [{ dx: 0, dz: 0, yMin: 0, yMax: 0 }]);
    turnRight();
    moveForward(1); // After turn, move 1 tile in NEW heading
    console.log(`After turn: heading=${heading}, pos=(${x},${y},${z})`);
  }
  
  else if (scenario === "start-straight-turnlong3") {
    placePiece("Start", [{ dx: 0, dz: 0, yMin: 0, yMax: 0 }]);
    moveForward(1);
    
    placePiece("Straight", [{ dx: 0, dz: 0, yMin: 0, yMax: 0 }]);
    moveForward(1);
    
    // TurnLong3 (3x3 footprint, turns right)
    // At heading=0 (north), 3x3 turn occupies 9 cells with offsets
    const turnLong3Footprint = [];
    for (let fx = 0; fx < 3; fx++) {
      for (let fz = 0; fz < 3; fz++) {
        turnLong3Footprint.push({ 
          dx: fx * TILE, 
          dz: -fz * TILE, // negative because heading north (-Z)
          yMin: 0, yMax: 0 
        });
      }
    }
    placePiece("TurnLong3", turnLong3Footprint);
    turnRight(); // Turn right: heading 0 → 3 (east)
    moveForward(3); // Move 3 tiles in NEW heading (east) = +X
    console.log(`After 3x3 turn: heading=${heading}, pos=(${x},${y},${z})`);
  }
  
  else if (scenario === "start-straight-turnlong3-straight") {
    placePiece("Start", [{ dx: 0, dz: 0, yMin: 0, yMax: 0 }]);
    moveForward(1);
    
    placePiece("Straight", [{ dx: 0, dz: 0, yMin: 0, yMax: 0 }]);
    moveForward(1);
    
    // TurnLong3 at (0,0,-4)
    const turnLong3Footprint = [];
    for (let fx = 0; fx < 3; fx++) {
      for (let fz = 0; fz < 3; fz++) {
        turnLong3Footprint.push({ 
          dx: fx * TILE, 
          dz: -fz * TILE,
          yMin: 0, yMax: 0 
        });
      }
    }
    placePiece("TurnLong3", turnLong3Footprint);
    console.log(`Turn occupies X range [${x}, ${x + 8}], Z range [${z - 8}, ${z}]`);
    
    turnRight(); // heading 0 → 3 (east)
    moveForward(3); // Move 3 tiles east to clear the 3x3
    console.log(`After turn movement: (${x},${y},${z})`);
    
    // Straight at (12, 0, -4)
    placePiece("Straight", [{ dx: 0, dz: 0, yMin: 0, yMax: 0 }]);
  }
  
  console.log("");
  return pieces;
}

// Run tests
buildTrackManually("start-straight-straight");
buildTrackManually("start-straight-turnshort");
buildTrackManually("start-straight-turnlong3");
buildTrackManually("start-straight-turnlong3-straight");

console.log("\n=== ANALYSIS ===");
console.log("If TurnLong3 at (0,0,-4) heading north and turns right:");
console.log("  - Footprint: 3x3 grid, origins at (0,0,-4), extends to (8,0,-8)");
console.log("  - After turn: heading becomes East (3)");
console.log("  - Exit should move 3 tiles EAST from (0,0,-4) = (12,0,-4)");
console.log("  - But your logs show piece#2 at (4,0,0) which is WRONG!");
console.log("\nPossible issues:");
console.log("  1. Exit calculation not using the new heading (still using old heading)");
console.log("  2. Exit position calculated BEFORE the turn heading changes");
console.log("  3. The footprint offset isn't matching the actual physical layout");
