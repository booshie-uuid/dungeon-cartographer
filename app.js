class AppViewModel
{
    constructor(renderer, explorer)
    {
        this.renderer = renderer;
        this.explorer = explorer;

        this.minCellSize = ko.observable(5);
        this.maxCellSize = ko.observable(15);
        this.roomCount = ko.observable(140);
        this.extraDoors = ko.observable(8);
        this.mergeChance = ko.observable(42);
        this.fillDensity = ko.observable(55);
        this.compoundRooms = ko.observable(5);
        this.continueChance = ko.observable(35);
        this.tileSize = ko.observable(4);
        this.renderMode = ko.observable("preview");

        this.mapSize = ko.observable("--");
        this.cellCount = ko.observable("--");
        this.genTime = ko.observable("--");
        this.errorMsg = ko.observable("");
    }

    setPreviewMode()
    {
        this.explorer.stop();
        this.renderMode("preview");

        if(this.renderer.mapData)
        {
            this.renderer.drawPreview(this.renderer.mapData, parseInt(this.tileSize(), 10));
        }
    }

    setTiledMode()
    {
        if(!this.renderer.tilesheet)
        {
            this.errorMsg("Tilesheet not loaded yet.");
            return;
        }

        this.renderMode("tiled");

        if(this.renderer.mapData)
        {
            this.explorer.start(this.renderer.mapData);
        }
    }

    renderMap(result, tileSize)
    {
        this.explorer.stop();
        
        if(this.renderMode() === "tiled" && this.renderer.tilesheet)
        {
            this.explorer.start(result);
        }
        else
        {
            this.renderer.drawPreview(result, tileSize);
        }
    }

    testReachability()
    {
        if(!this.renderer.mapData)
        {
            this.errorMsg("generate a map first dingus...");

            return;
        }

        this.errorMsg("");

        const tileSize = this.getNumber(this.tileSize(), 1, 16);

        this.renderer.drawReachability(this.renderer.mapData, tileSize, (allReachable) =>
        {
            this.errorMsg(allReachable ? "" : "can't reach all of the rooms");
        });
    }

    generate()
    {
        this.errorMsg("");

        const minCS = this.getNumber(this.minCellSize(), 5, 32);
        const maxCS = this.getNumber(this.maxCellSize(), minCS, 32);
        const roomCount = this.getNumber(this.roomCount(), 1, 500);
        const extraDoors = this.getNumber(this.extraDoors(), 0, 100);
        const mergeChance = this.getNumber(this.mergeChance(), 0, 100);
        const fillDensity = this.getNumber(this.fillDensity(), 10, 100);
        const compoundRooms = this.getNumber(this.compoundRooms(), 0, 100);
        const continueChance = this.getNumber(this.continueChance(), 0, 100);
        const tileSize = this.getNumber(this.tileSize(), 1, 16);

        this.minCellSize(minCS);
        this.maxCellSize(maxCS);
        this.roomCount(roomCount);
        this.extraDoors(extraDoors);
        this.mergeChance(mergeChance);
        this.fillDensity(fillDensity);
        this.compoundRooms(compoundRooms);
        this.continueChance(continueChance);
        this.tileSize(tileSize);

        const startTime = performance.now();

        try
        {
            const gen = new DungeonMapGenerator(
            {
                minCellSize: minCS,
                maxCellSize: maxCS,
                roomCount: roomCount,
                extraDoors: extraDoors,
                mergeChance: mergeChance / 100,
                fillDensity: fillDensity / 100,
                compoundRooms: compoundRooms,
                continueChance: continueChance / 100
            });

            const result = gen.generate();
            const elapsed = (performance.now() - startTime).toFixed(1);

            this.mapSize(result.width + " x " + result.height);
            this.cellCount(result.totalCells);
            this.genTime(elapsed + " ms");

            this.renderMap(result, tileSize);
        }
        catch(err)
        {
            this.errorMsg(err.message || String(err));
            this.mapSize("--");
            this.cellCount("--");
            this.genTime("--");
        }
    }

    getNumber(value, min, max)
    {
        let num = parseInt(value, 10);
     
        num = isNaN(num) ? min : num;
        num = (num < min) ? min : num;
        num = (num > max) ? max : num;
        
        return num;
    }

}

function initApp()
{
    const canvas = document.getElementById("canvas");
    const viewport = document.getElementById("viewport");

    const renderer = new DungeonMapRenderer(canvas);
    const explorer = new MapExplorer(renderer);

    renderer.loadTilesheet("tilesheet.png", 32);
    explorer.loadSpritesheet("spritesheet.png", 32);
    renderer.enableDragging(viewport);

    canvas.addEventListener("click", (e) =>
    {
        if(!explorer.active) { return; }
        const rect = canvas.getBoundingClientRect();
        explorer.handleClick(e.clientX - rect.left, e.clientY - rect.top);
    });

    const vm = new AppViewModel(renderer, explorer);
    ko.applyBindings(vm);
    vm.generate();
}

document.addEventListener("DOMContentLoaded", initApp);
