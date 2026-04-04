/********************************************************************************
 * MapExplorer
 * 
 * A basic click-to-move character controller to help explore tile based maps.
 * Designed for use with DungeonMapGenerator and DungeonMapRenderer.
 * 
 * Automatically pans the map to ensure the character remains in view.
 * 
 * @author Matthew Lynch
 * @license 
 * Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)	
 *******************************************************************************/

class MapExplorer
{
    constructor(renderer)
    {
        this.renderer = renderer;
        this.spritesheet = null;
        this.spriteSize = 0;
        this.mapData = null;
        this.playerRow = 0;
        this.playerCol = 0;
        this.path = [];
        this.destRow = -1;
        this.destCol = -1;
        this.walking = false;
        this.walkSpeed = 80;
        this.active = false;
        this.scrollAnimationId = null;

        renderer.onDragStart = () => this.cancelScroll();
    }

    loadSpritesheet(src, tileSize)
    {
        return new Promise((resolve, reject) =>
        {
            const img = new Image();
            img.onload = () =>
            {
                this.spritesheet = img;
                this.spriteSize = tileSize;
                resolve();
            };
            img.onerror = reject;
            img.src = src;
        });
    }

    start(mapData)
    {
        this.mapData = mapData;
        this.path = [];
        this.destRow = -1;
        this.destCol = -1;
        this.walking = false;

        this.cancelScroll();

        this.renderer.drawTiled(mapData);

        const startPos = this.findRandomFloorTile();
        this.playerRow = startPos.row;
        this.playerCol = startPos.col;
        this.active = true;

        this.drawOverlay();
        this.snapScrollToPlayer();
    }

    stop()
    {
        this.active = false;
        this.path = [];
        this.walking = false;

        this.cancelScroll();
    }

    cancelScroll()
    {
        if(this.scrollAnimationId)
        {
            cancelAnimationFrame(this.scrollAnimationId);
            this.scrollAnimationId = null;
        }
    }


    /* RENDERING *******************************************************************/

    drawOverlay()
    {
        if(!this.active || !this.mapData) { return; }

        this.renderer.redrawTiles(this.mapData);

        const ctx = this.renderer.ctx;
        const size = this.renderer.spriteTileSize;

        if(!this.spritesheet) { return; }

        for(const step of this.path)
        {
            this.drawSprite(ctx, 2, step.col, step.row, size);
        }

        if(this.destRow >= 0)
        {
            this.drawSprite(ctx, 1, this.destCol, this.destRow, size);
        }

        this.drawSprite(ctx, 0, this.playerCol, this.playerRow, size);
    }

    drawSprite(ctx, spriteIndex, col, row, destSize)
    {
        const sourceX = spriteIndex * this.spriteSize;
        ctx.drawImage(this.spritesheet, sourceX, 0, this.spriteSize, this.spriteSize,
            col * destSize, row * destSize, destSize, destSize);
    }


    /* MOVEMENT *********************************************************************/

    handleClick(canvasX, canvasY)
    {
        if(!this.active || !this.mapData) { return; }

        const tileSize = this.renderer.spriteTileSize;
        const col = Math.floor(canvasX / tileSize);
        const row = Math.floor(canvasY / tileSize);

        if(row < 0 || row >= this.mapData.height || col < 0 || col >= this.mapData.width) { return; }

        const tile = this.mapData.grid[row][col].type;
        if(tile !== TILES.FLOOR && tile !== TILES.DOOR) { return; }

        const path = this.findPath(this.playerRow, this.playerCol, row, col);
        if(path.length === 0) { return; }

        this.path = path;
        this.destRow = row;
        this.destCol = col;
        this.drawOverlay();

        if(!this.walking)
        {
            this.walkPath();
        }
    }

    walkPath()
    {
        if(this.path.length === 0)
        {
            this.walking = false;
            this.destRow = -1;
            this.destCol = -1;
            this.renderer.redrawTile(this.mapData, this.playerRow, this.playerCol);
            this.drawSprite(this.renderer.ctx, 0, this.playerCol, this.playerRow, this.renderer.spriteTileSize);
            return;
        }

        this.walking = true;
        const prevRow = this.playerRow;
        const prevCol = this.playerCol;
        const next = this.path.shift();
        this.playerRow = next.row;
        this.playerCol = next.col;

        const ctx = this.renderer.ctx;
        const size = this.renderer.spriteTileSize;

        this.renderer.redrawTile(this.mapData, prevRow, prevCol);
        this.renderer.redrawTile(this.mapData, this.playerRow, this.playerCol);
        this.drawSprite(ctx, 0, this.playerCol, this.playerRow, size);

        this.smoothScrollToPlayer();
        setTimeout(() => this.walkPath(), this.walkSpeed);
    }
   

    /* MAP CONTROL ******************************************************************/

    snapScrollToPlayer()
    {
        const viewport = this.renderer.viewport;
        if(!viewport) { return; }

        const target = this.getPlayerScrollTarget();

        viewport.scrollLeft = target.x;
        viewport.scrollTop = target.y;
    }

    smoothScrollToPlayer()
    {
        if(this.scrollAnimationId)
        {
            cancelAnimationFrame(this.scrollAnimationId);
        }

        const viewport = this.renderer.viewport;
        if(!viewport) { return; }

        const target = this.getPlayerScrollTarget();
        const ease = 0.15;

        const animate = () =>
        {
            const dx = target.x - viewport.scrollLeft;
            const dy = target.y - viewport.scrollTop;

            if(Math.abs(dx) < 1 && Math.abs(dy) < 1)
            {
                viewport.scrollLeft = target.x;
                viewport.scrollTop = target.y;
                this.scrollAnimationId = null;
                return;
            }

            viewport.scrollLeft += dx * ease;
            viewport.scrollTop += dy * ease;

            this.scrollAnimationId = requestAnimationFrame(animate);
        };

        this.scrollAnimationId = requestAnimationFrame(animate);
    }

    getPlayerScrollTarget()
    {
        const viewport = this.renderer.viewport;
        const size = this.renderer.spriteTileSize;
        
        const playerCenterX = this.playerCol * size + size / 2;
        const playerCenterY = this.playerRow * size + size / 2;

        return {
            x: Math.max(0, playerCenterX - viewport.clientWidth / 2),
            y: Math.max(0, playerCenterY - viewport.clientHeight / 2)
        };
    }

    /* PATH FINDING *****************************************************************/

    findPath(startRow, startCol, endRow, endCol)
    {
        // pretty generic A* implementation

        const grid = this.mapData.grid;
        const width = this.mapData.width;
        const height = this.mapData.height;

        const key = (r, c) => r * width + c;
        const heuristic = (r, c) => Math.abs(r - endRow) + Math.abs(c - endCol);

        const startKey = key(startRow, startCol);
        const endKey = key(endRow, endCol);

        const cameFrom = new Map();
        const actualCost = new Map();
              actualCost.set(startKey, 0);

        const open = [{ key: startKey, row: startRow, col: startCol, estCost: heuristic(startRow, startCol) }];

        while(open.length > 0)
        {
            const current = open.shift();

            // skip stale entries (higher estimated cost)
            if(current.estCost > (actualCost.get(current.key) || 0) + heuristic(current.row, current.col) + 0.5)
            {
                continue;
            }

            if(current.key === endKey)
            {
                return this.reconstructPath(cameFrom, endKey, startKey, width);
            }

            // try each neighbor
            for(const [dr, dc] of Object.values(DIRS))
            {
                const nr = current.row + dr;
                const nc = current.col + dc;

                if(nr < 0 || nr >= height || nc < 0 || nc >= width) { continue; }

                // skip if not passable
                const tileType = grid[nr][nc].type;
                if(tileType !== TILES.FLOOR && tileType !== TILES.DOOR) { continue; }

                const nKey = key(nr, nc);
                const tentative = actualCost.get(current.key) + 1;
                const existing = actualCost.get(nKey);

                // don't bother with more expensive paths
                if(existing !== undefined && tentative >= existing) { continue; }

                actualCost.set(nKey, tentative);
                cameFrom.set(nKey, current.key);

                // insert into the list of open nodes
                const estCost = tentative + heuristic(nr, nc);
                const entry = { key: nKey, row: nr, col: nc, estCost: estCost };

                let inserted = false;
                for(let i = 0; i < open.length; i++)
                {
                    if(estCost <= open[i].estCost)
                    {
                        open.splice(i, 0, entry);
                        inserted = true;

                        break;
                    }
                }

                if(!inserted) { open.push(entry); }
            }
        }

        return [];
    }

    reconstructPath(cameFrom, endKey, startKey, width)
    {
        const path = [];
        let currentKey = endKey;

        while(currentKey !== startKey)
        {
            const row = Math.floor(currentKey / width);
            const col = currentKey % width;
            
            path.unshift({ row, col });
            currentKey = cameFrom.get(currentKey);

            if(currentKey === undefined) { return []; }
        }

        return path;
    }

    findRandomFloorTile()
    {
        const grid = this.mapData.grid;
        const floorTiles = [];

        for(let row = 0; row < this.mapData.height; row++)
        {
            for(let col = 0; col < this.mapData.width; col++)
            {
                if(grid[row][col].type === TILES.FLOOR) { floorTiles.push({ row, col }); }
            }
        }

        return floorTiles[Math.floor(Math.random() * floorTiles.length)];
    }
    
}
