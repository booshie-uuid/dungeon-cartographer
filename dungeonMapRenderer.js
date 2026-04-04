/********************************************************************************
 * DungeonMapRenderer
 * 
 * A simple tile based map renderer designed for maps generated with DungeonMapGenerator.
 * 
 * Supports a simplified "preview" mode with scaled down, flat colour representations of tiles,
 * as well as a more traditional/complete mode with sprite-based tiles.
 * 
 * The tiled mode supports the map being dragged/panned with the right mouse button.
 * 
 * @author Matthew Lynch
 * @license 
 * Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)	
 *******************************************************************************/

class DungeonMapRenderer
{
    constructor(canvas)
    {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");
        this.tilesheet = null;
        this.spriteTileSize = 0;
        this.mapData = null;
        this.previewTileSize = 4;
        this.viewport = null;
        this.onDragStart = null;
    }

    centerCanvas(center)
    {
        if(!this.viewport) { return; }

        if(center)
        {
            const vw = this.viewport.clientWidth;
            const vh = this.viewport.clientHeight;
            const cw = this.canvas.width;
            const ch = this.canvas.height;
            
            const vertMargin = ch < vh ? Math.floor((vh - ch) / 2) + "px " : "0 ";
            const horizMargin = cw < vw ? "auto" : "0";

            this.canvas.style.margin = vertMargin + horizMargin;
        }
        else
        {
            this.canvas.style.margin = "0";
        }
    }

    loadTilesheet(src, tileSize)
    {
        return new Promise((resolve, reject) =>
        {
            const img = new Image();

            img.onload = () =>
            {
                this.tilesheet = img;
                this.spriteTileSize = tileSize;
                resolve();
            };
            img.onerror = reject;

            img.src = src;
        });
    }


    /* PREVIEW MODE *****************************************************************/

    drawPreview(mapData, tileSize)
    {
        const previewColours = ["#0a0908", "#3d3529", "#b89b6a", "#c45030"];

        this.mapData = mapData;
        this.previewTileSize = tileSize;

        this.canvas.width = mapData.width * tileSize;
        this.canvas.height = mapData.height * tileSize;

        const ctx = this.ctx;
        const grid = mapData.grid;

        for(let row = 0; row < mapData.height; row++)
        {
            for(let col = 0; col < mapData.width; col++)
            {
                ctx.fillStyle = previewColours[grid[row][col].type] || previewColours[0];
                ctx.fillRect(col * tileSize, row * tileSize, tileSize, tileSize);
            }
        }

        if(tileSize >= 6)
        {
            this.drawGridLines(mapData.width, mapData.height, tileSize);
        }

        this.centerCanvas(true);
    }

    drawGridLines(cols, rows, tileSize)
    {
        const ctx = this.ctx;

        ctx.strokeStyle = "rgba(0,0,0,0.15)";
        ctx.lineWidth = 0.5;

        for(let r = 0; r <= rows; r++)
        {
            ctx.beginPath();
            ctx.moveTo(0, r * tileSize);
            ctx.lineTo(cols * tileSize, r * tileSize);
            ctx.stroke();
        }

        for(let c = 0; c <= cols; c++)
        {
            ctx.beginPath();
            ctx.moveTo(c * tileSize, 0);
            ctx.lineTo(c * tileSize, rows * tileSize);
            ctx.stroke();
        }
    }


    /* TILED MODE *******************************************************************/

    drawTiled(mapData)
    {
        if(!this.tilesheet) { return; }

        this.mapData = mapData;

        const size = this.spriteTileSize;
        const targetW = mapData.width * size;
        const targetH = mapData.height * size;

        if(this.canvas.width !== targetW || this.canvas.height !== targetH)
        {
            this.canvas.width = targetW;
            this.canvas.height = targetH;
            this.centerCanvas(false);
        }

        this.redrawTiles(mapData);
    }

    redrawTiles(mapData)
    {
        const ctx = this.ctx;
        const grid = mapData.grid;
        const sheet = this.tilesheet;
        const size = this.spriteTileSize;

        for(let row = 0; row < mapData.height; row++)
        {
            for(let col = 0; col < mapData.width; col++)
            {
                const tile = grid[row][col];
                const sourceX = tile.type * size;
                const sourceY = tile.variant * size;

                ctx.drawImage(sheet, sourceX, sourceY, size, size, col * size, row * size, size, size);
            }
        }
    }

    redrawTile(mapData, row, col)
    {
        const size = this.spriteTileSize;
        const tile = mapData.grid[row][col];
        const sourceX = tile.type * size;
        const sourceY = tile.variant * size;

        this.ctx.drawImage(this.tilesheet, sourceX, sourceY, size, size, col * size, row * size, size, size);
    }

    /* DRAGGING/PANNING *************************************************************/

    enableDragging(viewport)
    {
        this.viewport = viewport;

        let dragging = false;
        let startX = 0;
        let startY = 0;
        let scrollStartX = 0;
        let scrollStartY = 0;

        viewport.addEventListener("contextmenu", (e) => e.preventDefault());

        viewport.addEventListener("mousedown", (e) =>
        {
            if(e.button !== 2) { return; }
            
            if(this.onDragStart) { this.onDragStart(); }

            dragging = true;
            
            startX = e.clientX;
            startY = e.clientY;
            
            scrollStartX = viewport.scrollLeft;
            scrollStartY = viewport.scrollTop;
            
            viewport.style.cursor = "grabbing";
            
            e.preventDefault();
        });

        viewport.addEventListener("mousemove", (e) =>
        {
            if(!dragging) { return; }

            viewport.scrollLeft = scrollStartX - (e.clientX - startX);
            viewport.scrollTop = scrollStartY - (e.clientY - startY);
        });

        const stopDrag = () =>
        {
            if(!dragging) { return; }

            dragging = false;
            viewport.style.cursor = "";
        };

        viewport.addEventListener("mouseup", stopDrag);
        viewport.addEventListener("mouseleave", stopDrag);
    }
    
}
