/**
 * Map rendering functionality for Wolfenstein 3D
 */
class MapRenderer {
    constructor(game) {
        this.game = game;
        this.canvas = null;
        this.ctx = null;
        this.size = 0;
        this.cellSize = 0;
        this.offsetX = 0;
        this.offsetY = 0;
        this.levelWidth = 64;
        this.levelHeight = 64;
        this.padding = 20;
    }

    /**
     * Initialize the map renderer
     * @param {jQuery} mapScreen - The map screen container
     */
    init(mapScreen) {
        // Create canvas if it doesn't exist
        this.canvas = mapScreen.find("canvas");
        if (this.canvas.length === 0) {
            this.canvas = $("<canvas>");
            mapScreen.append(this.canvas);
        }

        // Set canvas size to 80% of the smaller screen dimension
        this.size = Math.min(window.innerWidth, window.innerHeight) * 0.8;
        this.canvas.attr("width", this.size);
        this.canvas.attr("height", this.size);
        
        this.ctx = this.canvas[0].getContext("2d");
        this.calculateScaling();
    }

    /**
     * Calculate scaling and centering for the map
     */
    calculateScaling() {
        // Calculate cell size with padding
        var availableWidth = this.size - (this.padding * 2);
        var availableHeight = this.size - (this.padding * 2);
        this.cellSize = Math.min(availableWidth / this.levelWidth, availableHeight / this.levelHeight);
        
        // Calculate centering offsets with padding
        this.offsetX = this.padding + (availableWidth - (this.levelWidth * this.cellSize)) / 2;
        this.offsetY = this.padding + (availableHeight - (this.levelHeight * this.cellSize)) / 2;
    }

    /**
     * Convert game coordinates to map coordinates
     * @param {number} x - Game x coordinate
     * @param {number} y - Game y coordinate
     * @returns {Object} Map coordinates {x, y}
     */
    gameToMapCoordinates(x, y) {
        return {
            x: this.offsetX + (x >> Wolf.TILESHIFT) * this.cellSize,
            y: this.offsetY + (this.levelHeight - 1 - (y >> Wolf.TILESHIFT)) * this.cellSize
        };
    }

    /**
     * Draw the map background
     */
    drawBackground() {
        this.ctx.fillStyle = "#444";
        this.ctx.fillRect(0, 0, this.size, this.size);
    }

    /**
     * Draw secret areas
     */
    drawSecretAreas() {
        for (var x = 0; x < this.levelWidth; x++) {
            for (var y = this.levelHeight - 1; y >= 0; y--) {
                if (this.game.level.tileMap[x][y] & Wolf.SECRET_TILE) {
                    this.ctx.fillStyle = "#ff0";
                    this.ctx.fillRect(
                        this.offsetX + x * this.cellSize,
                        this.offsetY + (this.levelHeight - 1 - y) * this.cellSize,
                        this.cellSize,
                        this.cellSize
                    );
                }
            }
        }
    }

    /**
     * Draw walls
     */
    drawWalls() {
        this.ctx.strokeStyle = "#000";
        this.ctx.lineWidth = 2;
        
        for (var x = 0; x < this.levelWidth; x++) {
            for (var y = this.levelHeight - 1; y >= 0; y--) {
                if (this.game.level.tileMap[x][y] & Wolf.SOLID_TILE) {
                    this.ctx.strokeRect(
                        this.offsetX + x * this.cellSize,
                        this.offsetY + (this.levelHeight - 1 - y) * this.cellSize,
                        this.cellSize,
                        this.cellSize
                    );
                }
            }
        }
    }

    /**
     * Draw player position and direction
     */
    drawPlayer() {
        const pos = this.gameToMapCoordinates(
            this.game.player.position.x,
            this.game.player.position.y
        );

        // Draw player position circle
        this.ctx.fillStyle = "#f00";
        this.ctx.beginPath();
        this.ctx.arc(
            pos.x + this.cellSize/2,
            pos.y + this.cellSize/2,
            this.cellSize/2,
            0,
            Math.PI * 2
        );
        this.ctx.fill();

        // Draw player direction
        this.ctx.strokeStyle = "#f00";
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(pos.x + this.cellSize/2, pos.y + this.cellSize/2);
        this.ctx.lineTo(
            pos.x + this.cellSize/2 + Math.cos(Wolf.FINE2RAD(this.game.player.angle)) * this.cellSize,
            pos.y + this.cellSize/2 + Math.sin(Wolf.FINE2RAD(this.game.player.angle)) * this.cellSize
        );
        this.ctx.stroke();
    }

    /**
     * Render the complete map
     */
    render() {
        this.drawBackground();
        this.drawSecretAreas();
        this.drawWalls();
        this.drawPlayer();
    }
} 