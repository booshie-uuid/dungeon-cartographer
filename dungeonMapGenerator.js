/********************************************************************************
 * DungeonMapGenerator
 * 
 * A map generator for 2D tile-based dungeon maps, using a meta grid to provide
 * a sense of purpose and structure amongst the otherwise chaotic labyrinth of rooms.
 * 
 * The meta grid creates a tartan-style pattern of randomly sized bands that allow
 * for rooms of varying size while ensuring walls remain aligned to a consistent grid.
 * 
 * For added variety, rooms can also be merged after being placed.
 * 
 * @author Matthew Lynch
 * @license 
 * Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)	
 *******************************************************************************/

const TILES = { VOID: 0, WALL: 1, FLOOR: 2, DOOR: 3 };
const SIDES = { RIGHT: 0, BOTTOM: 1 };
const DIRS = { UP: [-1, 0], DOWN: [1, 0], LEFT: [0, -1], RIGHT: [0, 1] };

class DungeonMapGenerator
{
    constructor({
        mapWidth = 200,
        mapHeight = 200,
        minCellSize = 5,
        maxCellSize = 15,
        roomCount = 140,
        extraDoors = 8,
        mergeChance = 0.42,
        fillDensity = 0.55,
        compoundRooms = 5,
        continueChance = 0.35
    } = {})
    {
        this.mapWidth = mapWidth;
        this.mapHeight = mapHeight;
        this.minCellSize = minCellSize;
        this.maxCellSize = maxCellSize;
        this.roomCount = roomCount;
        this.extraDoors = extraDoors;
        this.mergeChance = mergeChance;
        this.fillDensity = fillDensity;
        this.compoundRooms = compoundRooms;
        this.continueChance = continueChance;
    }

    generate()
    {
        const metaGrid = this.buildMetaGrid();

        this.state = {
            occupied: new Uint8Array(metaGrid.numRows * metaGrid.numCols),
            rooms: [],
            treeEdges: [],
            mergedPairs: [],
            metaGrid: metaGrid
        };

        this.placeRooms();
        this.fixDiagonalVoids();
        this.placeCompoundRooms();

        const width = metaGrid.totalW;
        const height = metaGrid.totalH;

        const grid = [];
        for(let r = 0; r < height; r++)
        {
            const row = [];

            for(let c = 0; c < width; c++) { row.push(this.makeTile(TILES.VOID)); }

            grid.push(row);
        }

        this.placeTiles(grid);
        this.placeDoors(grid);

        const result = { grid, width, height, totalCells: this.state.rooms.length };

        this.state = null;
        
        return result;
    }


    /* META GRID ********************************************************************/

    buildMetaGrid()
    {
        const aspect = this.mapWidth / this.mapHeight;
        const gridArea = this.roomCount / this.fillDensity;
        const gridSize = Math.max(4, Math.ceil(Math.sqrt(gridArea)));
        
        const numCols = Math.max(4, Math.round(gridSize * Math.sqrt(aspect)));
        const numRows = Math.max(4, Math.round(gridSize / Math.sqrt(aspect)));

        // create bands of different sizes like a tartan pattern to allow for rooms
        // of varying size while keeping all walls aligned to a consistent grid
        const colWidths = this.generateBandSizes(numCols);
        const rowHeights = this.generateBandSizes(numRows);
        
        const colX = [0];
        const rowY = [0];

        for(let c = 1; c < numCols; c++) { colX.push(colX[c - 1] + colWidths[c - 1] - 1); }
        for(let r = 1; r < numRows; r++) { rowY.push(rowY[r - 1] + rowHeights[r - 1] - 1); }

        const totalW = colX[numCols - 1] + colWidths[numCols - 1];
        const totalH = rowY[numRows - 1] + rowHeights[numRows - 1];

        return { colWidths, rowHeights, colX, rowY, totalW, totalH, numCols, numRows };
    }

    generateBandSizes(count)
    {
        const sizes = [];
        for(let i = 0; i < count; i++)
        {
            sizes.push(this.randomOdd(this.minCellSize, this.maxCellSize));
        }

        return sizes;
    }


    /* ROOM PLACEMENT ***************************************************************/

    placeRooms()
    {
        const metaGrid = this.state.metaGrid;

        const centreRow = Math.floor(metaGrid.numRows / 2);
        const centreCol = Math.floor(metaGrid.numCols / 2);
        const centre = this.jitterCell(centreRow, centreCol, 1);
        
        this.placeRoom(centre.row, centre.col);
        this.tryMerge(centre.row, centre.col);

        const lastRow = metaGrid.numRows - 1;
        const lastCol = metaGrid.numCols - 1;
        const corners = this.shuffle([
            this.jitterCell(0, 0, 1),
            this.jitterCell(0, lastCol, 1),
            this.jitterCell(lastRow, 0, 1),
            this.jitterCell(lastRow, lastCol, 1)
        ]);

        for(const corner of corners)
        {
            this.expandToward(corner);
        }

        this.fillGaps();
    }

    jitterCell(targetR, targetC, spread)
    {
        const metaGrid = this.state.metaGrid;
        const r = targetR + Math.floor(Math.random() * (spread * 2 + 1)) - spread;
        const c = targetC + Math.floor(Math.random() * (spread * 2 + 1)) - spread;
        return {
            row: Math.max(0, Math.min(metaGrid.numRows - 1, r)),
            col: Math.max(0, Math.min(metaGrid.numCols - 1, c))
        };
    }

    expandToward(target)
    {
        const metaGrid = this.state.metaGrid;
        const maxSteps = metaGrid.numRows + metaGrid.numCols;

        let tip = this.findClosestRoom(target.row, target.col);

        for(let step = 0; step < maxSteps && this.state.rooms.length < this.roomCount; step++)
        {
            if(Math.abs(tip.row - target.row) + Math.abs(tip.col - target.col) <= 1)
            {
                if(!this.isOccupied(target.row, target.col))
                {
                    this.placeRoom(target.row, target.col);
                    this.state.treeEdges.push(this.makeEdge(tip.row, tip.col, target.row, target.col));
                    this.tryMerge(target.row, target.col);
                }

                break;
            }

            const next = this.pickDirectionToward(tip.row, tip.col, target.row, target.col);

            if(!next) { break; }

            this.placeRoom(next.row, next.col);
            this.state.treeEdges.push(this.makeEdge(tip.row, tip.col, next.row, next.col));
            this.tryMerge(next.row, next.col);
            
            tip = next;
        }
    }

    fillGaps()
    {
        let attempts = 0;
        const maxAttempts = this.roomCount * 3;

        while(this.state.rooms.length < this.roomCount && attempts < maxAttempts)
        {
            attempts++;

            // periodically steer towards the emptiest areas of map to avoid leaving huge gaps
            const target = (attempts % 5 === 0) ? this.findEmptiestZone() : null;

            const base = target
                       ? this.findClosestRoom(target.row, target.col)
                       : this.state.rooms[Math.floor(Math.random() * this.state.rooms.length)];

            let tip = base;

            const branchLen = 2 + Math.floor(Math.random() * 5);          
            for(let b = 0; b < branchLen && this.state.rooms.length < this.roomCount; b++)
            {
                const next = target
                           ? this.pickDirectionToward(tip.row, tip.col, target.row, target.col)
                           : this.pickRandomNeighbour(tip.row, tip.col);
                
                if(!next) { break; }

                this.placeRoom(next.row, next.col);
                this.state.treeEdges.push(this.makeEdge(tip.row, tip.col, next.row, next.col));
                this.tryMerge(next.row, next.col);

                tip = next;
            }
        }
    }

    placeRoom(row, col)
    {
        this.state.occupied[this.cellIndex(row, col)] = 1;
        this.state.rooms.push({ row, col });
    }

    isOccupied(row, col)
    {
        const metaGrid = this.state.metaGrid;

        if(row < 0 || row >= metaGrid.numRows || col < 0 || col >= metaGrid.numCols) { return false; }
        
        return this.state.occupied[this.cellIndex(row, col)] === 1;
    }

    tryMerge(row, col)
    {
        if(Math.random() >= this.mergeChance) { return; }

        const neighbours = this.findFreeNeighbours(row, col);

        if(neighbours.length === 0) { return; }

        const pick = neighbours[Math.floor(Math.random() * neighbours.length)];

        this.placeRoom(pick.row, pick.col);
        this.state.mergedPairs.push(this.makeEdge(row, col, pick.row, pick.col));
    }

    pickDirectionToward(row, col, targetRow, targetCol)
    {
        const distNow = Math.abs(row - targetRow) + Math.abs(col - targetCol);
        const scored = [];

        // score based on how close to target (with a bit of randomness for variety)
        for(const neighbour of this.findFreeNeighbours(row, col))
        {
            const distAfter = Math.abs(neighbour.row - targetRow) + Math.abs(neighbour.col - targetCol);
            const improvement = distNow - distAfter;

            neighbour.score = improvement * 0.4 + Math.random() * 0.8;

            scored.push(neighbour);
        }

        if(scored.length === 0) { return null; }

        scored.sort((a, b) => b.score - a.score);

        return scored[0];
    }

    pickRandomNeighbour(row, col)
    {
        const neighbours = this.findFreeNeighbours(row, col);

        if(neighbours.length === 0) { return null; }

        return neighbours[Math.floor(Math.random() * neighbours.length)];
    }

    findFreeNeighbours(row, col)
    {
        const metaGrid = this.state.metaGrid;
        const result = [];

        for(const [dr, dc] of Object.values(DIRS))
        {
            const nr = row + dr;
            const nc = col + dc;

            if(nr < 0 || nr >= metaGrid.numRows) { continue; }
            if(nc < 0 || nc >= metaGrid.numCols) { continue; }
            
            if(this.isOccupied(nr, nc)) { continue; }

            result.push({ row: nr, col: nc });
        }

        return result;
    }

    findClosestRoom(targetRow, targetCol)
    {
        let best = this.state.rooms[0];
        let bestDist = Infinity;

        for(const room of this.state.rooms)
        {
            const d = Math.abs(room.row - targetRow) + Math.abs(room.col - targetCol);

            if(d < bestDist)
            { 
                bestDist = d; 
                best = room;
            }
        }

        return best;
    }

    findEmptiestZone()
    {
        // split the map into 3x3 zones and find the emptiest

        const metaGrid = this.state.metaGrid;
        const zoneRows = 3;
        const zoneCols = 3;

        let bestZoneRow = -1;
        let bestZoneCol = -1;
        let bestCount = Infinity;

        for(let zr = 0; zr < zoneRows; zr++)
        {
            for(let zc = 0; zc < zoneCols; zc++)
            {
                const { count, hasFree } = this.countRoomsInZone(zr, zc, zoneRows, zoneCols, metaGrid);

                if(hasFree && count < bestCount)
                {
                    bestCount = count;
                    bestZoneRow = zr;
                    bestZoneCol = zc;
                }
            }
        }

        if(bestZoneRow < 0) { return null; }

        return {
            row: Math.floor((bestZoneRow + 0.5) * metaGrid.numRows / zoneRows),
            col: Math.floor((bestZoneCol + 0.5) * metaGrid.numCols / zoneCols)
        };
    }

    countRoomsInZone(zoneRow, zoneCol, zoneRows, zoneCols, metaGrid)
    {
        const rowLo = Math.floor(zoneRow * metaGrid.numRows / zoneRows);
        const rowHi = Math.floor((zoneRow + 1) * metaGrid.numRows / zoneRows);
        const colLo = Math.floor(zoneCol * metaGrid.numCols / zoneCols);
        const colHi = Math.floor((zoneCol + 1) * metaGrid.numCols / zoneCols);

        let count = 0;
        let hasFree = false;

        for(let r = rowLo; r < rowHi; r++)
        {
            for(let c = colLo; c < colHi; c++)
            {
                if(this.isOccupied(r, c))
                { 
                    count++;
                }
                else
                { 
                    hasFree = true; 
                }
            }
        }

        return { count, hasFree };
    }

    
    /* ANOMALY CORRECTION ***********************************************************/
    
    fixDiagonalVoids()
    {
        const metaGrid = this.state.metaGrid;

        for(let r = 0; r < metaGrid.numRows - 1; r++)
        {
            for(let c = 0; c < metaGrid.numCols - 1; c++)
            {
                const tl = this.isOccupied(r, c);
                const tr = this.isOccupied(r, c + 1);
                const bl = this.isOccupied(r + 1, c);
                const br = this.isOccupied(r + 1, c + 1);

                let voidA = null;
                let voidB = null;

                if(tl && br && !tr && !bl)
                {
                    voidA = { row: r, col: c + 1 };
                    voidB = { row: r + 1, col: c };
                }
                else if(!tl && !br && tr && bl)
                {
                    voidA = { row: r, col: c };
                    voidB = { row: r + 1, col: c + 1 };
                }
                else
                { 
                    continue;
                }

                const nA = this.countOccupiedNeighbours(voidA.row, voidA.col);
                const nB = this.countOccupiedNeighbours(voidB.row, voidB.col);

                const fill = (nA > nB) ? voidA : (nB > nA) ? voidB : (Math.random() < 0.5 ? voidA : voidB);

                this.placeRoom(fill.row, fill.col);

                for(const [dr, dc] of Object.values(DIRS))
                {
                    const nr = fill.row + dr;
                    const nc = fill.col + dc;

                    if(this.isOccupied(nr, nc))
                    {
                        this.state.treeEdges.push(this.makeEdge(fill.row, fill.col, nr, nc));

                        break;
                    }
                }
            }
        }
    }

    countOccupiedNeighbours(row, col)
    {
        let count = 0;
        for(const [dr, dc] of Object.values(DIRS))
        {
            if(this.isOccupied(row + dr, col + dc)) { count++; }
        }

        return count;
    }


    /* COMPOUND ROOMS ***************************************************************/

    findGrowthNeighbours(cell, cameFrom, claimed, localClaimed)
    {
        const metaGrid = this.state.metaGrid;
        const neighbours = [];

        for(const [dr, dc] of Object.values(DIRS))
        {
            if(cameFrom && dr === cameFrom.dr && dc === cameFrom.dc) { continue; }

            const r = cell.row + dr;
            const c = cell.col + dc;

            if(r < 0 || r >= metaGrid.numRows || c < 0 || c >= metaGrid.numCols) { continue; }
            if(!this.isOccupied(r, c)) { continue; }
            if(claimed[this.cellKey(r, c)] || localClaimed[this.cellKey(r, c)]) { continue; }

            neighbours.push({ row: r, col: c });
        }

        return neighbours;
    }

    growCompoundRoom(seed, claimed)
    {
        const perpDirs = seed.side === SIDES.RIGHT
            ? [DIRS.UP, DIRS.DOWN]
            : [DIRS.LEFT, DIRS.RIGHT];

        // find off-axis neighbours from either cell in the seed pair
        const options = [];

        for(const anchor of [seed.a, seed.b])
        {
            for(const [dr, dc] of perpDirs)
            {
                const r = anchor.row + dr;
                const c = anchor.col + dc;

                if(r < 0 || r >= this.state.metaGrid.numRows) { continue; }
                if(c < 0 || c >= this.state.metaGrid.numCols) { continue; }
                if(!this.isOccupied(r, c)) { continue; }
                if(claimed[this.cellKey(r, c)]) { continue; }

                options.push({ anchor, neighbour: { row: r, col: c }, dr, dc });
            }
        }

        if(options.length === 0) { return null; }

        const pick = options[Math.floor(Math.random() * options.length)];
        const cells = [pick.neighbour];
        const edges = [this.makeEdge(pick.anchor.row, pick.anchor.col, pick.neighbour.row, pick.neighbour.col)];

        const localClaimed = {};
        localClaimed[this.cellKey(pick.neighbour.row, pick.neighbour.col)] = true;

        let lastCell = pick.neighbour;
        let cameFrom = { dr: -pick.dr, dc: -pick.dc };

        // continue growing with fading probability
        let p = this.continueChance;

        while(Math.random() < p)
        {
            p *= this.continueChance;

            const next = this.findGrowthNeighbours(lastCell, cameFrom, claimed, localClaimed);

            if(next.length === 0) { break; }

            const nextPick = next[Math.floor(Math.random() * next.length)];

            edges.push(this.makeEdge(lastCell.row, lastCell.col, nextPick.row, nextPick.col));
            cells.push(nextPick);
            localClaimed[this.cellKey(nextPick.row, nextPick.col)] = true;

            cameFrom = { dr: lastCell.row - nextPick.row, dc: lastCell.col - nextPick.col };
            lastCell = nextPick;
        }

        return { cells, edges };
    }

    placeCompoundRooms()
    {
        if(this.compoundRooms <= 0) { return; }

        const claimed = {};

        for(const m of this.state.mergedPairs)
        {
            claimed[this.cellKey(m.a.row, m.a.col)] = true;
            claimed[this.cellKey(m.b.row, m.b.col)] = true;
        }

        const seeds = this.shuffle(this.state.mergedPairs.slice());
        let placed = 0;

        for(const seed of seeds)
        {
            if(placed >= this.compoundRooms) { break; }

            const result = this.growCompoundRoom(seed, claimed);

            if(!result) { continue; }

            for(const cell of result.cells)
            {
                claimed[this.cellKey(cell.row, cell.col)] = true;
            }

            for(const edge of result.edges)
            {
                this.state.mergedPairs.push(edge);
            }

            // remove merged walls from edges list to avoid floating doors
            const internalKeys = {};
            for(const edge of result.edges)
            {
                internalKeys[this.pairKey(edge.a, edge.b)] = true;
            }

            this.state.treeEdges = this.state.treeEdges.filter(
                e => !internalKeys[this.pairKey(e.a, e.b)]
            );

            placed++;
        }
    }


    /* TILE PLACEMENTS **************************************************************/

    placeTiles(grid)
    {
        const metaGrid = this.state.metaGrid;

        for(const cell of this.state.rooms)
        {
            const x = metaGrid.colX[cell.col];
            const y = metaGrid.rowY[cell.row];
            const w = metaGrid.colWidths[cell.col];
            const h = metaGrid.rowHeights[cell.row];

            // wall tiles
            for(let r = y; r < y + h; r++)
            {
                for(let c = x; c < x + w; c++)
                { 
                    grid[r][c] = this.makeTile(TILES.WALL);
                }
            }

            // floor tiles
            for(let r = y + 1; r < y + h - 1; r++)
            {
                for(let c = x + 1; c < x + w - 1; c++)
                { 
                    grid[r][c] = this.makeTile(TILES.FLOOR);
                }
            }
        }

        for(const merge of this.state.mergedPairs)
        {
            this.openMergedWall(merge, metaGrid, grid);
        }
    }

    openMergedWall(merge, metaGrid, grid)
    {
        if(merge.side === SIDES.RIGHT)
        {
            const sharedCol = metaGrid.colX[merge.a.col] + metaGrid.colWidths[merge.a.col] - 1;
            const top = metaGrid.rowY[merge.a.row] + 1;
            const bot = metaGrid.rowY[merge.a.row] + metaGrid.rowHeights[merge.a.row] - 2;

            for(let r = top; r <= bot; r++)
            {
                grid[r][sharedCol] = this.makeTile(TILES.FLOOR);
            }
        }
        else
        {
            const sharedRow = metaGrid.rowY[merge.a.row] + metaGrid.rowHeights[merge.a.row] - 1;
            const left = metaGrid.colX[merge.a.col] + 1;
            const right = metaGrid.colX[merge.a.col] + metaGrid.colWidths[merge.a.col] - 2;
            
            for(let c = left; c <= right; c++)
            {
                grid[sharedRow][c] = this.makeTile(TILES.FLOOR);
            }
        }
    }

    placeDoors(grid)
    {
        const metaGrid = this.state.metaGrid;
        const mergedSet = this.buildMergedSet(this.state.mergedPairs);
        const doors = [];
        const placed = {};

        for(const edge of this.state.treeEdges)
        {
            const pairKey = this.pairKey(edge.a, edge.b);
            const door = this.positionDoor(edge.a, edge.side, metaGrid);

            if(door)
            { 
                doors.push(door);
                placed[pairKey] = true;
            }
        }

        // add some variety to paths by adding some extra doors to rooms that aren't already connected
        const extraCandidates = this.findExtraDoorCandidates(placed, mergedSet);
        
        this.shuffle(extraCandidates);

        const extraCount = Math.min(this.extraDoors, extraCandidates.length);
        for(let i = 0; i < extraCount; i++)
        {
            const candidate = extraCandidates[i];
            const door = this.positionDoor(candidate.a, candidate.side, metaGrid);

            if(door)
            { 
                doors.push(door);
                placed[candidate.pairKey] = true;
            }
        }

        // set door tiles
        for(const door of doors)
        { 
            grid[door.tileRow][door.tileCol] = this.makeTile(TILES.DOOR);
        }

        return doors;
    }

    buildMergedSet(mergedPairs)
    {
        const set = {};

        for(const m of mergedPairs)
        {
            set[this.pairKey(m.a, m.b)] = true;
        }

        return set;
    }

    findExtraDoorCandidates(placed, mergedSet)
    {
        const roomLookup = {};
        for(const room of this.state.rooms) { roomLookup[this.cellKey(room.row, room.col)] = room; }

        const candidates = [];

        for(const room of this.state.rooms)
        {
            const rightNeighbour = roomLookup[this.cellKey(room.row, room.col + 1)];
            if(rightNeighbour)
            {
                const pk = this.pairKey(room, rightNeighbour);
                if(!placed[pk] && !mergedSet[pk])
                {
                    candidates.push({ a: room, b: rightNeighbour, side: SIDES.RIGHT, pairKey: pk });
                }
            }

            const bottomNeighbour = roomLookup[this.cellKey(room.row + 1, room.col)];
            if(bottomNeighbour)
            {
                const pk = this.pairKey(room, bottomNeighbour);
                if(!placed[pk] && !mergedSet[pk])
                {
                    candidates.push({ a: room, b: bottomNeighbour, side: SIDES.BOTTOM, pairKey: pk });
                }
            }
        }

        return candidates;
    }

    positionDoor(cellA, side, metaGrid)
    {
        if(side === SIDES.RIGHT)
        {
            const sharedCol = metaGrid.colX[cellA.col] + metaGrid.colWidths[cellA.col] - 1;
            const overlapTop = metaGrid.rowY[cellA.row] + 1;
            const overlapBot = metaGrid.rowY[cellA.row] + metaGrid.rowHeights[cellA.row] - 2;

            return { tileRow: this.cornerSkipCenter(overlapTop, overlapBot), tileCol: sharedCol };
        }
        else
        {
            const sharedRow = metaGrid.rowY[cellA.row] + metaGrid.rowHeights[cellA.row] - 1;
            const overlapLeft = metaGrid.colX[cellA.col] + 1;
            const overlapRight = metaGrid.colX[cellA.col] + metaGrid.colWidths[cellA.col] - 2;

            return { tileRow: sharedRow, tileCol: this.cornerSkipCenter(overlapLeft, overlapRight) };
        }
    }

    cornerSkipCenter(innerMin, innerMax)
    {
        const validStart = innerMin + 1;
        const validEnd = innerMax - 1;

        return validStart > validEnd
               ? Math.floor((innerMin + innerMax) / 2)
               : this.biasedCenter(validStart, validEnd);
    }

    biasedCenter(min, max)
    {
        const centre = Math.floor((min + max) / 2);
        const halfRange = Math.floor((max - min) / 4);
        const offset = halfRange > 0
                     ? Math.floor(Math.random() * (halfRange * 2 + 1)) - halfRange
                     : 0;

        return Math.max(min, Math.min(max, centre + offset));
    }


    /* HELPER FUNCTIONS *************************************************************/

    makeEdge(r1, c1, r2, c2)
    {
        if(c2 === c1 + 1) { return { a: { row: r1, col: c1 }, b: { row: r2, col: c2 }, side: SIDES.RIGHT }; }
        if(c1 === c2 + 1) { return { a: { row: r2, col: c2 }, b: { row: r1, col: c1 }, side: SIDES.RIGHT }; }
        if(r2 === r1 + 1) { return { a: { row: r1, col: c1 }, b: { row: r2, col: c2 }, side: SIDES.BOTTOM }; }

        return { a: { row: r2, col: c2 }, b: { row: r1, col: c1 }, side: SIDES.BOTTOM };
    }

    cellIndex(row, col)
    { 
        return row * this.state.metaGrid.numCols + col;
    }

    cellKey(row, col)
    { 
        return row + '_' + col;
    }

    pairKey(cellA, cellB)
    { 
        return this.cellKey(cellA.row, cellA.col) + '|' + this.cellKey(cellB.row, cellB.col);
    }

    makeTile(type)
    {
        return { type, variant: Math.floor(Math.random() * 4) };
    }

    randomOdd(min, max)
    {
        if(min % 2 === 0) { min++; }
        if(max % 2 === 0) { max--; }

        if(min > max) { return min; }

        const steps = Math.floor((max - min) / 2);

        return min + Math.floor(Math.random() * (steps + 1)) * 2;
    }

    shuffle(arr)
    {
        for(let i = arr.length - 1; i > 0; i--)
        {
            const j = Math.floor(Math.random() * (i + 1));
            const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
        }

        return arr;
    }

}
