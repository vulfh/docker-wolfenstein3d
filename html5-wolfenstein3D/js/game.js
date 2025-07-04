/** 
 * @namespace 
 * @description Game management
 */
Wolf.Game = (function() {
    Wolf.setConsts({
        BUTTON_ATTACK   : 1,
        BUTTON_USE      : 2,
        BUTTON_ANY      : 128,            // any key whatsoever

        BASEMOVE        : 35,
        RUNMOVE         : 70,
        MOVESCALE       : 150,
        BACKMOVESCALE   : 100,
        MAXMOUSETURN    : 10,
        TURNANGLESCALE  : 300,
        MOUSEDEADBAND   : 0.2,
        
        gd_baby         : 0,
        gd_easy         : 1,
        gd_medium       : 2,
        gd_hard         : 3
    });

    const ELEVATOR_COLOR = "#0f0";

    var rendering = false,
        playing = false,
        fsInit = false,
        hndRender = 0,
        hndCycle = 0,
        hndFps = 0,
        lastFPSTime = 0,
        lastFrame = 0,
        frameNum = 0,
        cycleNum = 0,
        mouseEnabled = false,
        paused = false,
        intermissionAnim = 0,
        currentGame = null,
        levelMusic,
        processAI = true,
        keyInputActive = false,
        preloadTextures = {},
        preloadSprites = {},

        controls = {
            up          : ["UP"],
            left        : ["LEFT"],
            down        : ["DOWN"],
            right       : ["RIGHT"],
            run         : ["SHIFT"],
            attack      : ["X"],
            use         : ["SPACE"],
            strafe      : ["Z"],
            weapon1     : ["1"],
            weapon2     : ["2"],
            weapon3     : ["3"],
            weapon4     : ["4"]
        },
        ticsPerSecond = 70,
        lastTimeCount = 0;
        
    /**
     * @description Build the movement, angles, and buttons for a frame of action:
     *   Player.angle
     *   Player.cmd.buttons
     *   Player.cmd.forwardMove
     *   Player.cmd.sideMove
     * @private 
     * @param {object} player The player object.
     * @param {number} tics The number of tics since last frame.
     */
    function updatePlayerControls(player, tics) {
        var moveValue,
            running = false,
            strafing = false,
            leftKey = false,
            rightKey = false,
            downKey = false,
            upKey = false,
            changeWeapon = -1,
            mouseMovement,
            mouseCoords;
       
        player.cmd.buttons = 0;
        player.cmd.forwardMove = 0;
        player.cmd.sideMove = 0;
        
        leftKey = Wolf.Input.checkKeys(controls.left);
        rightKey = Wolf.Input.checkKeys(controls.right);
        downKey = Wolf.Input.checkKeys(controls.down);
        upKey = Wolf.Input.checkKeys(controls.up);
        
        running = Wolf.Input.checkKeys(controls.run);
        strafing = Wolf.Input.checkKeys(controls.strafe);
        moveValue = (running ? Wolf.RUNMOVE : Wolf.BASEMOVE);
       
        if (Wolf.Input.checkKeys(controls.attack) || (mouseEnabled && Wolf.Input.leftMouseDown())) {
            player.cmd.buttons |= Wolf.BUTTON_ATTACK;
        }
       
        if (mouseEnabled && Wolf.Input.rightMouseDown()) {
            if (mouseCoords = Wolf.Input.getMouseCoords()) {
                player.cmd.forwardMove += - (mouseCoords.y < 0 ? Wolf.MOVESCALE : Wolf.BACKMOVESCALE) * moveValue * mouseCoords.y;
            }
        } else if (!(upKey && downKey)) {
            if (upKey) {
                player.cmd.forwardMove += moveValue * Wolf.MOVESCALE;
            }
            if (downKey) {
                player.cmd.forwardMove += -moveValue * Wolf.BACKMOVESCALE;
            } 
        }

        if (mouseEnabled && Wolf.Input.isPointerLocked()) {
            mouseMovement = Wolf.Input.getMouseMovement();
            player.angle -= (mouseMovement.x * Wolf.TURNANGLESCALE * tics)>>0;
        } else {
            if (leftKey) {
                if (strafing) {
                    player.cmd.sideMove += -moveValue * Wolf.MOVESCALE;
                } else {
                    player.angle += Wolf.TURNANGLESCALE * tics;
                }
            }
            if (rightKey) {
                if (strafing) {
                    player.cmd.sideMove += moveValue * Wolf.MOVESCALE;
                } else {
                    player.angle -= Wolf.TURNANGLESCALE * tics;
                }
            }
            
            if (mouseEnabled && (mouseCoords = Wolf.Input.getMouseCoords())) {
                if (Math.abs(mouseCoords.x) > Wolf.MOUSEDEADBAND) {
                    player.angle -= (Wolf.TURNANGLESCALE * tics * (mouseCoords.x + (mouseCoords.x < 0 ? 1 : -1) * Wolf.MOUSEDEADBAND))>>0;
                }
            }
        }
        
        // change weapon?
        if (Wolf.Input.checkKeys(controls.weapon1) && player.items & Wolf.ITEM_WEAPON_1) {
            changeWeapon = Wolf.WEAPON_KNIFE;
        } else if (Wolf.Input.checkKeys(controls.weapon2) && player.items & Wolf.ITEM_WEAPON_2 && player.ammo[Wolf.AMMO_BULLETS]) {
            changeWeapon = Wolf.WEAPON_PISTOL;
        } else if (Wolf.Input.checkKeys(controls.weapon3) && player.items & Wolf.ITEM_WEAPON_3 && player.ammo[Wolf.AMMO_BULLETS]) {
            changeWeapon = Wolf.WEAPON_AUTO;
        } else if (Wolf.Input.checkKeys(controls.weapon4) && player.items & Wolf.ITEM_WEAPON_4 && player.ammo[Wolf.AMMO_BULLETS]) {
            changeWeapon = Wolf.WEAPON_CHAIN;
        }
        if (changeWeapon > -1) {
            player.previousWeapon = Wolf.WEAPON_KNIFE;
            player.weapon = player.pendingWeapon = changeWeapon;
        }
        
        if (Wolf.Input.checkKeys(controls.use)) {
            player.cmd.buttons |= Wolf.BUTTON_USE;
        }
    }

    /**
     * @description Initiate the game cycle to process player and world logic
     * @private
     * @param {object} game The game object
     */
    function startGameCycle(game) {
        var deathTics = 0,
            deathTicsMax = ticsPerSecond * 2;
            
        // cancel existing game cycle
        if (hndCycle) {
            clearTimeout(hndCycle);
            hndCycle = 0;
        }

        function nextCycle() {
            if (!playing) {
                return;
            }
        
            hndCycle = setTimeout(nextCycle, 1000 / 30);
            cycleNum++;

            if (paused) {
                return;
            }
            
            var player = game.player,
                level = game.level,
                lives, score,
                tics = calcTics();
            
            if (player.playstate != Wolf.ex_dead) {
                updatePlayerControls(player, tics);
        
                player.angle = Wolf.Math.normalizeAngle(player.angle);
        
                Wolf.Player.process(game, player, tics);
                if (processAI) {
                    Wolf.Actors.process(game, tics);
                }
                Wolf.PushWall.process(level, tics);
                Wolf.Doors.process(level, player, tics);
            } else {
           
                if (died(game, tics)) {
                    deathTics += tics;
                    if (deathTics >= deathTicsMax) {
                        deathTics = 0;
                        $("#game .renderer .death").css("display", "none");

                        if (game.player.lives > 0) {
                            lives = game.player.lives;
                            score = game.player.startScore;
                            game.level = Wolf.Level.reload(level);
                            Wolf.Level.scanInfoPlane(game.level, game.skill); // Spawn items/guards
                            game.player = Wolf.Player.spawn(game.level.spawn, game.level, game.skill);
                            game.player.lives = lives - 1;
                            game.player.score = score;
                            game.player.startScore = score;
                            game.level.state.startTime = (new Date).getTime();
                            game.level.state.elapsedTime = 0;
                        } else {
                            gameOver(game);
                            return;
                        }
                    } else {
                        $("#game .renderer .death").css({
                            display : "block",
                            backgroundColor : "rgba(255,0,0," + (deathTics / deathTicsMax) + ")"
                        });
                    }
                }
            }
            Wolf.Sprites.clean(level);
            updateHUD(game, tics);
           
        }
        
        lastTimeCount = (new Date).getTime();
        nextCycle();
    }
    
    
    function died(game, tics) {
        var fangle,
            dx, dy,
            iangle, curangle,
            clockwise, 
            counter,
            change,
            player = game.player,
            killer = player.lastAttacker;

        //gamestate.weapon = -1;			// take away weapon
        //SD_PlaySound (PLAYERDEATHSND);

        // swing around to face attacker

        dx = killer.x - player.position.x;
        dy = player.position.y - killer.y;

        fangle = -Math.atan2(dy,dx);			// returns -pi to pi
        if (fangle < 0) {
            fangle = Math.PI * 2 + fangle;
        }

        iangle = Math.round(fangle / (Math.PI * 2) * Wolf.ANGLES);

        curangle = Wolf.FINE2DEG(player.angle);

        if (curangle > iangle) {
            counter = curangle - iangle;
            clockwise = Wolf.ANGLES - curangle + iangle;
        } else {
            clockwise = iangle - curangle;
            counter = curangle + Wolf.ANGLES - iangle;
        }

        if (clockwise < counter) {
            // rotate clockwise
            if (curangle > iangle) {
                curangle -= Wolf.ANGLES;
            }
            if (curangle == iangle) {
                return true;
            } else {
                change = tics * Wolf.DEATHROTATE;
                if (curangle + change > iangle) {
                    change = iangle - curangle;
                }
                curangle += change;
                if (curangle >= Wolf.ANGLES) {
                    curangle -= Wolf.ANGLES;
                }
                player.angle = Wolf.DEG2FINE(curangle);
            }
        } else {
            // rotate counterclockwise
            if (curangle < iangle) {
                curangle += Wolf.ANGLES;
            }
            if (curangle == iangle) {
                return true;
            } else {
                change = -tics * Wolf.DEATHROTATE;
                if (curangle + change < iangle) {
                    change = iangle - curangle;
                }
                curangle += change;
                if (curangle < 0) {
                    curangle += Wolf.ANGLES;
                }
                player.angle = Wolf.DEG2FINE(curangle);
            }
        }
        return false;
    }
    
    /**
     * @description Game over. No more lives.
     * @private
     * @param {object} game The game object
     */
    function gameOver(game) {
        playing = false;
        rendering = false;
        
        $("#game .renderer").hide();
        $("#game .fps").hide();
        $("#game .gameover").show();
        endGame();
        
        function exit() {
            $(document).off("keydown", progress);
            $("#game").fadeOut(null, function() {
                $("#game .gameover").hide();
                Wolf.Menu.show();
            });
        }
        function progress(e) {
            if (!$("#game .gameover").is(":visible")) {
                exit();
                return;
            }
            if (e.keyCode == 13 || e.keyCode == 32) {
                exit();
            }
        }
        $(document).on("keydown", progress);
    }
    
    
    function victory(game) {
        if (game.player.playstate == Wolf.ex_victory) {
            return;
        }
        keyInputActive = false;
        Wolf.log("Victory!");
        $("#game .renderer .player-weapon").hide();
        Wolf.Actors.spawnBJVictory(game.player, game.level, game.skill);
        game.player.playstate = Wolf.ex_victory;
    }
    
    function endEpisode(game) {
        Wolf.Game.startIntermission(game);
    }
    
    /**
     * @description Calculate the number of tics since last time calcTics() was called.
     *              Accumulates fractions.
     * @private
     * @returns {number} The number of tics
     */
    function calcTics() {
        var now = (new Date).getTime(),
            delta = (now - lastTimeCount) / 1000,
            tics = Math.floor(ticsPerSecond * delta);

        lastTimeCount += (tics * 1000 / ticsPerSecond) >> 0;
        
        return tics;
    }

    /**
     * @description Update HUD stats
     * @private 
     * @param {string} name The name/class of the player stat (health, ammo, etc.)
     * @param {number} value The new value
     */
    function updateStat(name, value) {
        var numdivs = $("#game .hud ." + name + " .number");
        for (var i=numdivs.length-1;i>=0;i--) {
            if (value == 0 && i < numdivs.length-1) {
                numdivs[i].style.backgroundPosition = 16 + "px 0";
            } else {
                numdivs[i].style.backgroundPosition = - (16 * (value % 10)) + "px 0";
                value = (value / 10) >> 0;
            }
        }
    }
    
    
    
    
    /**
     * @description Update the HUD
     * @private 
     * @param {object} game The game object
     */
    function updateHUD(game, tics) {
        var player = game.player,
            frame = player.weapon * 4 + player.weaponFrame;

        if (player.playstate == Wolf.ex_dead || player.playstate == Wolf.ex_victory) {
            $("#game .renderer .player-weapon").css("display", "none");
        } else {
            $("#game .renderer .player-weapon").css({
                display : "block",
                backgroundPosition : - (frame * Wolf.HUD_WEAPON_WIDTH) + "px 0"
            });
        }
        
        $("#game .hud .weapon").css({
            backgroundPosition : - (player.weapon * 96) + "px 0"
        });
        
        $("#game .hud .key1").css({
            display : (player.items & Wolf.ITEM_KEY_1) ? "block" : "none"
        });
        $("#game .hud .key2").css({
            display : (player.items & Wolf.ITEM_KEY_2) ? "block" : "none"
        });
        
        updateStat("ammo", player.ammo[Wolf.AMMO_BULLETS]);
        updateStat("health", player.health);
        updateStat("lives", player.lives);
        updateStat("score", player.score);
        updateStat("floor", game.levelNum+1);
        
        drawFace(player, tics);
    }
    
    /**
     * @description Update the game display
     * @private 
     * @param {object} game The game object
     */
    function updateScreen(game) {
        var player = game.player,
            level = game.level,
            viewport = {
                x : player.position.x,
                y : player.position.y,
                angle : player.angle
            };
        
        var res = Wolf.Raycaster.traceRays(viewport, level);
        
        Wolf.Renderer.clear();
        Wolf.Renderer.draw(viewport, level, res.tracers, res.visibleTiles);
    }
    


     /**
     * @description Update BJ face pic
     * @private 
     * @param {object} player
     * @param {number} tics
     */
    function drawFace(player, tics) {
        var pic;
        // decide on the face
        player.faceCount += tics;
        if (player.faceGotGun && player.faceCount > 0) {
            // gotgun will set facecount to a negative number initially, go back
            // to normal face with random look after expired.
            player.faceGotGun = false;
        }
        if (player.faceCount > Wolf.Random.rnd()) {
            player.faceGotGun = player.faceOuch = false;
            player.faceFrame = Wolf.Random.rnd() >> 6;
            if( player.faceFrame == 3) {
                player.faceFrame = 0;
            }
            player.faceCount = 0;
        }

        if (player.health) {
            if (player.faceGotGun) {
                pic = 22;
            } else {
                var h = player.health;
                if (h > 100) {
                    h = 100;
                }
                if (h < 0) {
                    h = 0;
                }
                pic = (3*((100-h)/16)>>0) + player.faceFrame;
                
                //gsh
                if ((player.flags & Wolf.FL_GODMODE)) {
                    pic = 23 + player.faceFrame;
                }
            }
        } else {
            pic = 21;
        }

        $("#game .hud .bj").css({
            backgroundPosition : - (pic * Wolf.HUD_FACE_WIDTH) + "px 0"
        });
    }

    
    /**
     * @description Update the FPS counter
     * @private 
     */
    function updateFPS() {
        var now = (new Date).getTime(),
            dt = (now - lastFPSTime) / 1000,
            frames = frameNum - lastFrame;

        lastFPSTime = now;
        lastFrame = frameNum;
        
        $("#game .fps").html((frames / dt).toFixed(2));
    }

    /**
     * @description Initiate the rendering cycle
     * @private 
     * @param {object} game The game object
     */
    function startRenderCycle(game) {
        // cancel existing render cycle
        if (hndRender) {
            cancelAnimationFrame(hndRender);
            hndRender = 0;
        }
        
        /*
        if (!hndFps) {
            hndFps = setInterval(updateFPS, 1000);
        }
        $("#game .fps").show();
        */
        
        Wolf.Renderer.init();
        
        $("#game .renderer").show();
        
        function nextFrame() {
            if (!rendering) {
                return;
            }
            if (!paused) {
                updateScreen(game);
            }
            hndRender = requestAnimationFrame(nextFrame);
            frameNum++;
        }
        rendering = true;
        nextFrame();
    }

    
    /**
     * @description Start playing the specified level of the specified episode.
     * @memberOf Wolf.Game
     * @param {object} game The game object.
     * @param {number} episodeNum The episode number.
     * @param {number} levelNum The level number.
     */
    function startLevel(game, episodeNum, levelNum) {
        if (!Wolf.Episodes[episodeNum].enabled) {
            return;
        }
        
        playing = false;
        rendering = false;
        
        game.episodeNum = episodeNum;
        game.levelNum = levelNum;

        var episode = Wolf.Episodes[game.episodeNum];
        
        Wolf.Level.load(episode.levels[game.levelNum].file, {},function(error, level) {
            if (error) {
                throw error;
            }
            
            $("#game .renderer .floor").css({
                "background-color" : "rgb("
                    + level.floor[0] + ","
                    + level.floor[1] + ","
                    + level.floor[2] + ")"
            });
            
            $("#game .renderer .ceiling").css({
                "background-color" : "rgb("
                    + level.ceiling[0] + ","
                    + level.ceiling[1] + ","
                    + level.ceiling[2] + ")"
            });
            
           
            game.level = level;
            
            levelMusic = level.music;
            
            Wolf.Level.scanInfoPlane(level, game.skill); // Spawn items/guards
            
            /*
            game.player.position.x = 1944862;
            game.player.position.y = 2156427;
            game.player.angle = 8507;
            */
            
            $("#game .loading").show();

            preloadLevelAssets(level, function() {
                
                Wolf.Sound.startMusic(level.music);
                
                game.player = Wolf.Player.spawn(level.spawn, level, game.skill, game.player);
                
                game.player.startScore = game.player.score;
                
                level.state.startTime = (new Date).getTime();
                level.state.elapsedTime = 0;

                playing = true;
                startGameCycle(game);
                startRenderCycle(game);
                Wolf.Input.reset();
                Wolf.Input.lockPointer();
                
                $("#game .loading").hide();
                $("#game").focus();
                $("#game .renderer .player-weapon").show();
                keyInputActive = true;
            });

        });
    }

    /**
     * @description Preload the music and textures for the specified level
     * @private
     * @param {object} level The level object
     * @param {function} callback Called when all files have loaded.
     */
    function preloadLevelAssets(level, callback) {
        var files = [],
            tx, ty, texture, x, y, f, i, numFiles,
            texturePath = "art/walls-shaded/" + Wolf.TEXTURERESOLUTION + "/",
            spritePath = "art/sprites/" + Wolf.TEXTURERESOLUTION + "/";

        function addTexture(texture) {
            if (texture > 0) {
                if (texture % 2 == 0) {
                    texture--;
                }
                f = texturePath + "w_" + texture + ".png";
                if (!preloadTextures[f]) {
                    files.push(f);
                    preloadTextures[f] = true;
                }
            }
        }
       
        for (x=0;x<64;++x) {
            for (y=0;y<64;++y) {
                addTexture(level.wallTexX[x][y]);
                addTexture(level.wallTexY[x][y]);
            }
        }
        
        // static sprites
        f = spritePath + "002_053.png";
        if (!preloadSprites[f]) {
            files.push(f);
            preloadSprites[f] = true
        }
        
        /*
        for (i=0;i<level.state.guards.length;++i) {
            texture = level.state.guards[i].sprite;
            if (texture) {
                f = spritePath + Wolf.Sprites.getTexture(texture).sheet;
                if (!preloadSprites[f]) {
                    files.push(f);
                    preloadSprites[f] = true;
                }
            }
        }
        */
        
        for (i=0;i<files.length;++i) {
            files[i] = "preload!timeout=5!" + files[i];
        }
        
        if (files.length) {
            Modernizr.load({
                load : files,
                complete : callback
            });
        } else {
            callback();
        }
    }
    
   
    /**
     * @description Start a new game with the specified skill level.
     * @memberOf Wolf.Game
     * @param {number} skill The difficulty level.
     */
    function startGame(skill) {
        if (isPlaying()) {
            endGame();
            levelMusic = null;
            Wolf.Sound.stopAllSounds();
        }
        
        $("#game .renderer .death").hide();
        $("#game .renderer .damage-flash").hide();
        $("#game .renderer .bonus-flash").hide();
        $("#game").show();
        
        var game = {
            episode : -1,
            level : -1,
            skill : skill,
            killRatios : [],
            secretRatios : [],
            treasureRatios : [],
            totalTime : 0
        };
        currentGame = game; // for debugging only
        
        return game;
    }
    
    function endGame() {
        // cancel game cycle
        if (hndCycle) {
            clearTimeout(hndCycle);
            hndCycle = 0;
        }
        // cancel render cycle
        if (hndRender) {
            cancelAnimationFrame(hndRender);
            hndRender = 0;
        }
        playing = false;
        rendering = false;
        Wolf.Renderer.reset();
        if (paused) {
            togglePause();
        }
    }
    
    function startVictoryText(game) {
        endGame();
        $("#game").fadeOut(null, function() {
            var name = "victory" + (game.episodeNum+1), 
                num = (game.episodeNum == 2) ? 1 : 2;
                
            Wolf.Menu.showText(name, num, function() {
                Wolf.Menu.show("main");
            });
        });
    }
    
    /**
     * @description Start the post-level intermission.
     * @memberOf Wolf.Game
     * @param {object} game The game object.
     */
    function startIntermission(game, delay) {
        var episode = Wolf.Episodes[game.episodeNum],
            parTime = episode.levels[game.levelNum].partime * 60,
            bonus = 0,
            parBonusAmount = 500,
            ratioBonusAmount = 10000,
            levelState = game.level.state,
            killRatio = levelState.totalMonsters ? ((levelState.killedMonsters / levelState.totalMonsters * 100) >> 0) : 0,
            secretRatio = levelState.totalSecrets ? ((levelState.foundSecrets / levelState.totalSecrets * 100) >> 0) : 0,
            treasureRatio = levelState.totalTreasure ? ((levelState.foundTreasure / levelState.totalTreasure * 100) >> 0) : 0,
            time = levelState.elapsedTime + ((new Date).getTime() - levelState.startTime),
            totalTime, i,  
            avgKill = 0, avgSecret = 0, avgTreasure = 0;
            
        playing = false;

        Wolf.Sound.startMusic("music/URAHERO.ogg");
        
        $("#game .renderer").hide();
        $("#game .fps").hide();
        $("#game .intermission .digit").hide();
        $("#game .intermission").show();
        
        $("#game .intermission .background").hide();
        $("#game .intermission .background-secret").hide();
        $("#game .intermission .background-victory").hide();
        $("#game .intermission .stat").hide();
        $("#game .intermission .victory-stat").hide();
        $("#game .intermission .bj").hide();
        
        // 99 mins max
        time = Math.min(99*60, Math.round(time / 1000));
        
        killRatio = Math.min(killRatio, 100);
        secretRatio = Math.min(secretRatio, 100);
        treasureRatio = Math.min(treasureRatio, 100);

        game.killRatios.push(killRatio);
        game.secretRatios.push(secretRatio);
        game.treasureRatios.push(treasureRatio);
        game.totalTime += time;
       
        // secret level
        if (game.levelNum == 9) { 
            $("#game .intermission .background-secret").show();
            $("#game .intermission .bj").show();
            bonus = 15000;
            
        // boss level
        } else if (game.levelNum == 8) { 
            $("#game .intermission .background-victory").show();
            $("#game .intermission .victory-stat").show();
            
            totalTime = Math.min(99*60, game.totalTime);
            for (i=0;i<game.killRatios.length;i++) {
                avgKill += game.killRatios[i];
            }
            for (i=0;i<game.secretRatios.length;i++) {
                avgSecret += game.secretRatios[i];
            }
            for (i=0;i<game.treasureRatios.length;i++) {
                avgTreasure += game.treasureRatios[i];
            }
            avgKill = Math.round(avgKill / game.killRatios.length);
            avgSecret = Math.round(avgSecret / game.secretRatios.length);
            avgTreasure = Math.round(avgTreasure / game.treasureRatios.length);
            
            setIntermissionNumber("total-time-minutes", (totalTime / 60) >> 0, true);
            setIntermissionNumber("total-time-seconds", ((totalTime / 60) % 1) * 60, true);
            
            setIntermissionNumber("avg-kill-ratio", avgKill, false);
            setIntermissionNumber("avg-secret-ratio", avgSecret, false);
            setIntermissionNumber("avg-treasure-ratio", avgTreasure, false);

        // regular level
        } else {
            $("#game .intermission .background").show();
            $("#game .intermission .bj").show();
            $("#game .intermission .stat").show();
            
           
            if (parTime && parTime > time) {
                bonus += (parTime - time) * parBonusAmount;
            }
            if (killRatio == 100) {
                bonus += ratioBonusAmount;
            }
            if (secretRatio == 100) {
                bonus += ratioBonusAmount;
            }
            if (treasureRatio == 100) {
                bonus += ratioBonusAmount;
            }

            time = time / 60;
            parTime = parTime / 60;
            
            setIntermissionNumber("floor", game.levelNum + 1, false);
            
            setIntermissionNumber("bonus", bonus, false);
            
            setIntermissionNumber("time-minutes", time >> 0, true);
            setIntermissionNumber("time-seconds", (time % 1) * 60, true);

            setIntermissionNumber("par-minutes", parTime >> 0, true);
            setIntermissionNumber("par-seconds", (parTime % 1) * 60, true);
            
            setIntermissionNumber("kill-ratio", killRatio, false);
            setIntermissionNumber("secret-ratio", secretRatio, false);
            setIntermissionNumber("treasure-ratio", treasureRatio, false);
            
        }
        
        function anim() {
            var now = (new Date).getTime(),
                bjFrame = Math.floor(now / 500) % 2;

            $("#game .intermission .bj").css({
                backgroundPosition : - (162 * bjFrame) + "px 0px"
            });
            intermissionAnim = requestAnimationFrame(anim);
        }
        
        if (game.levelNum != 8) {
            if (!intermissionAnim) {
                anim();
            }
        }
        
        function exitIntermission() {
            if (intermissionAnim) {
                cancelAnimationFrame(intermissionAnim);
                intermissionAnim = 0;
            }
            $(document).off("keydown", progress);
            $("#game .intermission").hide();
        }
        
        function progress(e) {
            var nextLevel;
            if (!$("#game .intermission").is(":visible")) {
                exitIntermission();
                return;
            }
            if (e.keyCode == 13 || e.keyCode == 32) {
                exitIntermission();
                if (game.player.playstate == Wolf.ex_secretlevel) {
                    nextLevel = 9;
                } else {
                    if (game.levelNum == 8) { // Level was boss level - end of episode.
                        $("#game").fadeOut(1000, function() {
                            startVictoryText(game);
                        });
                        return;
                    } else if (game.levelNum == 9) { // Level was secret level - go to previous level + 1
                        // yuck
                        switch (game.episodeNum) {
                            case 0: nextLevel = 1;  break;
                            case 1: nextLevel = 1; break;
                            case 2: nextLevel = 7; break;
                            case 3: nextLevel = 3; break;
                            case 4: nextLevel = 4; break;
                            case 5: nextLevel = 3; break;
                            default: nextLevel = game.levelNum + 1; break;
                        }                        
                    } else {
                        nextLevel = game.levelNum + 1;
                    }
                }
                Wolf.Player.givePoints(game.player, bonus);
                startLevel(game, game.episodeNum, nextLevel);
            }
        }
        
        $(document).on("keydown", progress);
    }
    
    
    /**
     * @description Update an intermission screen stat.
     * @private
     * @param {object} name The name (and CSS class) of the stat
     * @param {number} value The value.
     * @param {boolean} zeros If true, leading zeros are displayed.
     */
    function setIntermissionNumber(name, value, zeros) {
        var digits = $("#game .intermission ." + name + " .digit"),
            i, digit, v;
        for (i=0;i<10;i++) {
            digits.removeClass("num-" + i);
        }
        value = value >> 0;
        v = value;
        for (i=0;i<digits.length;i++) {
            digit = v % 10;
            if (v > 0 || zeros || (value == 0 && i == 0)) {
                digits.eq(digits.length - 1 - i).addClass("num-" + digit);
            }
            v = (v / 10) >> 0;
        }
        digits.show();
    }

    
    /**
     * @description Start red damage flash.
     * @memberOf Wolf.Game
     */
    function startDamageFlash() {
        $("#game .renderer .damage-flash").show().fadeOut(300);
    }
    
    /**
     * @description Start bonus flash.
     * @memberOf Wolf.Game
     */
    function startBonusFlash() {
        $("#game .renderer .bonus-flash").show().fadeOut(300);
    }
    
    /**
     * @description Show a notification.
     * @memberOf Wolf.Game
     * @param {string} text The notification
     */
    function notify(text) {
        Wolf.log(text);
    }
    
    /**
     * @description Query fullscreen.
     * @memberOf Wolf.Game
     * @returns boolean True if browser is in fullscreen mode, otherwise false.
     */
    function isFullscreen() {
        if ("webkitIsFullScreen" in document) {
            return document.webkitIsFullScreen;
        } else if ("mozFullScreen" in document) {
            return document.mozFullScreen;
        } else if ($("#main").data("scale") > 1) {
            return true;
        }
        return false;
    }
    
    /**
     * @description Fullscreen event handler.
     * @private
     * @param {object} e Event object.
     */
    function fullscreenChange(e) {
        if (isFullscreen()) {
            enterFullscreen();
        } else {
            exitFullscreen();
        }
    }
    
    /**
     * @description Toggle the fullscreen state
     * @private
     */
    function toggleFullscreen() {
        var main = $("#main")[0],
            ret = false;
        if (isFullscreen()) {
            if (document.exitFullscreen) {
                document.exitFullscreen();
                return true;
            } else if (document.webkitCancelFullscreen) {
                document.webkitCancelFullscreen();
                return true;
            } else if (document.mozCancelFullscreen) {
                document.mozCancelFullscreen();
                return true;
            }
        } else {
            if (main.requestFullScreenWithKeys) {
                main.requestFullScreenWithKeys();
                return true;
            } else if (main.requestFullScreen) {
                main.requestFullScreen(true);
                return true;
            } else if (main.webkitRequestFullScreen) {
                main.webkitRequestFullScreen(true);
                return true;
            } else if (document.body.mozRequestFullScreenWithKeys) {
                document.body.mozRequestFullScreenWithKeys();
                return true;
            } else if (document.body.mozRequestFullScreen) {
                document.body.mozRequestFullScreen();
                return true;
            }
        }
        return false;
    }
    
    
    /**
     * @description Scale the game to fit fullscreen mode
     * @private
     */
    function enterFullscreen() {
        var ratio = window.innerWidth / 640,
            sliceZoom = Math.floor(Wolf.SLICE_WIDTH * ratio),
            zoom = sliceZoom / Wolf.SLICE_WIDTH,
            transform = "scale(" + zoom + ")";

        $("#main").css({
            "transform" : transform,
            "-webkit-transform" : transform,
            "-moz-transform" : transform,
            "-ms-transform" : transform,
            "-o-transform" : transform
        }).data("scale", zoom);
    }
    
    /**
     * @description Scale the game to fit windowed mode
     * @private
     */
    function exitFullscreen() {
        $("#main").css({
            "transform" : "",
            "-webkit-transform" : "",
            "-moz-transform" : "",
            "-ms-transform" : "",
            "-o-transform" : ""
        }).data("scale", 1);
    }
    
    
    /**
     * @description Initialize the game module
     * @memberOf Wolf.Game
     */
    function init() {
        $(document)
            .on("mozfullscreenchange", fullscreenChange)
            .on("webkitfullscreenchange", fullscreenChange)
            .on("fullscreenchange", fullscreenChange);
 
        Wolf.Input.bindKey("F11", function(e) {
            if (!keyInputActive) {
                return;
            }
            if (toggleFullscreen()) {
                e.preventDefault();
            } else {
                if (isFullscreen()) {
                    exitFullscreen();
                } else {
                    enterFullscreen();
                }
            }
        });
        
        Wolf.Input.bindKey("P", function(e) {
            if (!keyInputActive) {
                return;
            }
            togglePause();
        });
        
        Wolf.Input.bindKey("ESC", function(e) {
            if (!keyInputActive) {
                return;
            }
            // If map screen is visible, hide it
            if ($("#game .renderer .map-screen").is(":visible")) {
                $("#game .renderer .map-screen").hide();
                return;
            }
            exitToMenu();
        });

        Wolf.Input.bindKey("M", function(e) {
            if (!keyInputActive) {
                return;
            }
            // Toggle map screen
            var mapScreen = $("#game .renderer .map-screen");
            if (mapScreen.is(":visible")) {
                mapScreen.hide();
            } else {
                mapScreen.show();
                renderMap();
            }
        });
       
        if (!isFullscreen() && (window.fullScreen || (window.innerWidth == screen.width && window.innerHeight == screen.height))) {
            toggleFullscreen();
        }
    }
    
    function renderMap() {
        var mapScreen = $("#game .renderer .map-screen");
        var canvas = mapScreen.find("canvas");
        
        // Create canvas if it doesn't exist
        if (canvas.length === 0) {
            canvas = $("<canvas>");
            mapScreen.append(canvas);
        }

        // Set canvas size to 80% of the smaller screen dimension
        var size = Math.min(window.innerWidth, window.innerHeight) * 0.8;
        canvas.attr("width", size);
        canvas.attr("height", size);
        
        var ctx = canvas[0].getContext("2d");
        var level = currentGame.level;
        var player = currentGame.player;
        
        // Clear canvas with gray background
        ctx.fillStyle = "#444";
        ctx.fillRect(0, 0, size, size);
        
        // Calculate cell size to fit the level
        var levelWidth = 64; // Standard level width
        var levelHeight = 64; // Standard level height
        
        // Calculate cell size with some padding
        var padding = 20; // pixels of padding around the map
        var availableWidth = size - (padding * 2);
        var availableHeight = size - (padding * 2);
        var cellSize = Math.min(availableWidth / levelWidth, availableHeight / levelHeight);
        
        // Calculate centering offsets with padding
        var offsetX = padding + (availableWidth - (levelWidth * cellSize)) / 2;
        var offsetY = padding + (availableHeight - (levelHeight * cellSize)) / 2;
        
        // Draw map elements
        drawMapElements(ctx, level, levelWidth, levelHeight, cellSize, offsetX, offsetY);
        
        // Draw player position
        var playerX = offsetX + (player.position.x >> Wolf.TILESHIFT) * cellSize;
        var playerY = offsetY + (levelHeight - 1 - (player.position.y >> Wolf.TILESHIFT)) * cellSize;
        
        // Draw filled circle for player position
        ctx.fillStyle = "#f00";
        ctx.beginPath();
        ctx.arc(playerX + cellSize/2, playerY + cellSize/2, cellSize/2, 0, Math.PI * 2);
        ctx.fill();
        
        // Draw player direction
        ctx.strokeStyle = "#f00";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(playerX + cellSize/2, playerY + cellSize/2);
        ctx.lineTo(
            playerX + cellSize/2 + Math.cos(Wolf.FINE2RAD(player.angle)) * cellSize,
            playerY + cellSize/2 + Math.sin(Wolf.FINE2RAD(player.angle)) * cellSize
        );
        ctx.stroke();
    }

    function draw_elevator(ctx, level, levelWidth, levelHeight, cellSize, offsetX, offsetY) {
        for (var x = 0; x < levelWidth; x++) {
            for (var y = levelHeight - 1; y >= 0; y--) {
                if (level.tileMap[x][y] & Wolf.ELEVATOR_TILE) {
                    ctx.fillStyle = ELEVATOR_COLOR;
                    ctx.fillRect(offsetX + x * cellSize, offsetY + (levelHeight - 1 - y) * cellSize, cellSize, cellSize);
                }
            }
        }
    }

    function drawMapElements(ctx, level, levelWidth, levelHeight, cellSize, offsetX, offsetY) {
        // Draw secret areas first (as background)
        for (var x = 0; x < levelWidth; x++) {
            drawSecretAreaColumn(ctx, level, x, levelHeight, cellSize, offsetX, offsetY);
        }
        
        // Draw elevator tiles in green
        draw_elevator(ctx, level, levelWidth, levelHeight, cellSize, offsetX, offsetY);
        
        // Draw walls as black lines
        ctx.strokeStyle = "#000";
        ctx.lineWidth = 2;
        
        for (var x = 0; x < levelWidth; x++) {
            drawWallColumn(ctx, level, x, levelHeight, cellSize, offsetX, offsetY);
        }
    }

    function drawSecretAreaColumn(ctx, level, x, levelHeight, cellSize, offsetX, offsetY) {
        for (var y = levelHeight - 1; y >= 0; y--) {
            if (level.tileMap[x][y] & Wolf.SECRET_TILE) {
                ctx.fillStyle = "#ff0";
                ctx.fillRect(offsetX + x * cellSize, offsetY + (levelHeight - 1 - y) * cellSize, cellSize, cellSize);
            }
        }
    }

    function drawWallColumn(ctx, level, x, levelHeight, cellSize, offsetX, offsetY) {
        for (var y = levelHeight - 1; y >= 0; y--) {
            if (level.tileMap[x][y] & Wolf.SOLID_TILE) {
                // Draw cell border
                ctx.strokeRect(offsetX + x * cellSize, offsetY + (levelHeight - 1 - y) * cellSize, cellSize, cellSize);
            }
        }
    }
    
    /**
     * @description Exit to main menu
     * @memberOf Wolf.Game
     */
    function exitToMenu() {
        if (!paused) {
            togglePause();
        }
        $("#game").hide();
        keyInputActive = false;
        Wolf.Menu.show("main");
    }
    
    /**
     * @description Resume game after coming from menu
     * @memberOf Wolf.Game
     */
    function resume() {
        $("#game").show();
        if (paused) {
            togglePause();
        }
        keyInputActive = true;
        if (levelMusic) {
            Wolf.Sound.startMusic(levelMusic);
        }
    }
   
    
    /**
     * @description Query the game state
     * @memberOf Wolf.Game
     * @returns {boolean} True if the is currently playing
     */
    function isPlaying() {
        return playing;
    }
    
    
    /**
     * @description Toggle the pause state.
     * @private
     */
    function togglePause() {
        paused = !paused;
        if (paused) {
            Wolf.Sound.pauseMusic(true);
        } else {
            Wolf.Sound.pauseMusic(false);
            lastTimeCount = (new Date).getTime();
        }
        $("#game .renderer div.pause.overlay").toggle(paused);
    }
    
    
    function enableMouse(enable) {
        mouseEnabled = enable;
    }
    function isMouseEnabled() {
        return mouseEnabled;
    }

    function getControls() {
        var c = {};
        for (var a in controls) {
            if (controls.hasOwnProperty(a)) {
                c[a] = controls[a];
            }
        }
        return c;
    }
    
    function bindControl(action, keys) {
        controls[action] = keys;
    }
    
    /*
    function dump() {
        console.log(currentGame);
        window.open("data:text/plain," + JSON.stringify(currentGame), "dump");
    }
    
    function debugGodMode(enable) {
        if (currentGame && currentGame.player) {
            if (enable) {
                currentGame.player.flags |= Wolf.FL_GODMODE;
            } else {
                currentGame.player.flags &= ~Wolf.FL_GODMODE;
            }
            Wolf.log("God mode " + (enable ? "enabled" : "disabled"));
        }
    }
    
    function debugNoTarget(enable) {
        if (currentGame && currentGame.player) {
            if (enable) {
                currentGame.player.flags |= Wolf.FL_NOTARGET;
            } else {
                currentGame.player.flags &= ~Wolf.FL_NOTARGET;
            }
            Wolf.log("No target " + (enable ? "enabled" : "disabled"));
        }
    }
    
    function debugVictory() {
        if (currentGame && currentGame.player) {
            Wolf.log("Winning!");
            Wolf.Game.startIntermission(currentGame);
        }
    }
    
    function debugEndEpisode() {
        if (currentGame && currentGame.player) {
            victory(currentGame);
        }
    }
    
    function debugToggleAI(enable) {
        processAI = !!enable;
    }
    
    function debugGiveAll() {
        if (currentGame && currentGame.player) {
            Wolf.Player.givePoints(currentGame.player, 10000);
            Wolf.Player.giveHealth(currentGame.player, 100, 100);
            Wolf.Player.giveKey(currentGame.player, 0);
            Wolf.Player.giveKey(currentGame.player, 1);
            Wolf.Player.giveWeapon(currentGame.player, 2);
            Wolf.Player.giveWeapon(currentGame.player, 3);
            Wolf.Player.giveAmmo(currentGame.player, Wolf.AMMO_BULLETS, 99);
            Wolf.log("Giving keys, weapons, ammo, health and 10000 points");
        }
    }
    */
   
    function saveGameState() {
        try {
            // Check if currentGame and player are properly initialized
            if (!currentGame || !currentGame.player) {
                console.error('Cannot save game: Game or player not initialized');
                return false;
            }

            const gameState = {
                level: {
                    episodeNum: currentGame.episodeNum,
                    levelNum: currentGame.levelNum,
                    skill: currentGame.skill,
                    tileMap: currentGame.level.tileMap.map(row => [...row]), // Deep copy of tileMap
                    wallTexX: currentGame.level.wallTexX.map(row => [...row]), // Deep copy of wall textures X
                    wallTexY: currentGame.level.wallTexY.map(row => [...row]),  // Deep copy of wall textures Y
                    floor: [...currentGame.level.floor], // Save floor color
                    ceiling: [...currentGame.level.ceiling] // Save ceiling color
                },
                player: {
                    position: currentGame.player.position,
                    angle: currentGame.player.angle,
                    health: currentGame.player.health,
                    score: currentGame.player.score,
                    lives: currentGame.player.lives,
                    ammo: currentGame.player.ammo,
                    weapons: currentGame.player.weapons,
                    items: currentGame.player.items
                },
                levelAssets: {
                    collectedItems: {
                        ammo: currentGame.player.ammo[Wolf.AMMO_BULLETS],
                        weapons: currentGame.player.weapons,
                        keys: {
                            key1: !!(currentGame.player.items & Wolf.ITEM_KEY_1),
                            key2: !!(currentGame.player.items & Wolf.ITEM_KEY_2)
                        },
                        specialItems: {
                            backpack: !!(currentGame.player.items & Wolf.ITEM_BACKPACK),
                            augment: !!(currentGame.player.items & Wolf.ITEM_AUGMENT),
                            uniform: !!(currentGame.player.items & Wolf.ITEM_UNIFORM),
                            automap: !!(currentGame.player.items & Wolf.ITEM_AUTOMAP)
                        }
                    },
                    statistics: {
                        startTime: currentGame.level.state.startTime,
                        elapsedTime: currentGame.level.state.elapsedTime,
                        totalMonsters: currentGame.level.state.totalMonsters,
                        killedMonsters: currentGame.level.state.killedMonsters,
                        totalSecrets: currentGame.level.state.totalSecrets,
                        foundSecrets: currentGame.level.state.foundSecrets,
                        totalTreasure: currentGame.level.state.totalTreasure,
                        foundTreasure: currentGame.level.state.foundTreasure
                    },
                    collectibles: {
                        treasures: {
                            total: currentGame.level.state.totalTreasure,
                            found: currentGame.level.state.foundTreasure,
                            items: currentGame.level.state.powerups
                                .filter(powerup => powerup && powerup.id !== null && (
                                    powerup.type === Wolf.pow_cross ||
                                    powerup.type === Wolf.pow_chalice ||
                                    powerup.type === Wolf.pow_bible ||
                                    powerup.type === Wolf.pow_crown ||
                                    powerup.type === Wolf.pow_fullheal
                                ))
                                .map(powerup => ({
                                    id: powerup.id,
                                    type: powerup.type,
                                    position: {
                                        x: powerup.x,
                                        y: powerup.y
                                    },
                                    collected: powerup.x === -1,
                                    value: powerup.value
                                 
                                }))
                        },
                        healthItems: {
                            items: currentGame.level.state.powerups
                                .filter(powerup => powerup && (
                                    powerup.type === Wolf.pow_alpo ||
                                    powerup.type === Wolf.pow_food ||
                                    powerup.type === Wolf.pow_firstaid ||
                                    powerup.type === Wolf.pow_fullheal ||
                                    powerup.type === Wolf.pow_gibs ||
                                    powerup.type === Wolf.pow_gibs2
                                ))
                                .map(powerup => ({
                                    id: powerup.id,
                                    type: powerup.type,
                                    position: {
                                        x: powerup.x,
                                        y: powerup.y
                                    },
                                    collected: powerup.x === -1,
                                    // effect: getHealthItemEffect(powerup.type)
                                }))
                        },
                        powerups: {
                            total: currentGame.level.state.numPowerups,
                            items: currentGame.level.state.powerups
                                .filter(powerup => powerup && (
                                    powerup.type === Wolf.pow_25clip ||
                                    powerup.type === Wolf.pow_chaingun ||
                                    powerup.type === Wolf.pow_machinegun ||
                                    powerup.type === Wolf.pow_rifle ||
                                    powerup.type === Wolf.pow_clip ||
                                    powerup.type === Wolf.pow_clip2
                                ))
                                .map(powerup => ({
                                    id: powerup.id,
                                    type: powerup.type,
                                    position: {
                                        x: powerup.x,
                                        y: powerup.y
                                    },
                                    collected: powerup.x === -1,
                                    // effect: getPowerupEffect(powerup.type)
                                }))
                        }
                    }
                },
                actors: currentGame.level.state.guards.map(actor => {
                    if (!actor) return null;
                    return {
                        id: actor.id,
                        type: actor.type,
                        state: actor.state,
                        health: actor.health,
                        isDead: actor.isDead,
                        position: {
                            x: actor.x,
                            y: actor.y
                        },
                        angle: actor.angle
                    };
                }).filter(actor => actor !== null)
            };

            localStorage.setItem('wolfenstein_savegame', JSON.stringify(gameState));
            return true;
        } catch (e) {
            console.error('Failed to save game:', e);
            return false;
        }
    }
   
    function loadGameState() {
        try {
            const savedGame = localStorage.getItem('wolfenstein_savegame');
            if (!savedGame) {
                return false;
            }

            const gameState = JSON.parse(savedGame);
            
            // Start a new game with the saved skill level
            const game = startGame(gameState.level.skill);
            
            // Set the episode and level numbers
            game.episodeNum = gameState.level.episodeNum;
            game.levelNum = gameState.level.levelNum;
            
            // Create a map of saved powerup states
            const savedPowerups = {};
            if (gameState.levelAssets && gameState.levelAssets.collectibles) {
                // Add treasure items
                if (gameState.levelAssets.collectibles.treasures && gameState.levelAssets.collectibles.treasures.items) {
                    gameState.levelAssets.collectibles.treasures.items.forEach(powerup => {
                        savedPowerups[powerup.id] = {
                            collected: powerup.collected
                        };
                    });
                }
                // Add health items
                if (gameState.levelAssets.collectibles.healthItems && gameState.levelAssets.collectibles.healthItems.items) {
                    gameState.levelAssets.collectibles.healthItems.items.forEach(powerup => {
                        savedPowerups[powerup.id] = {
                            collected: powerup.collected
                        };
                    });
                }
                // Add weapon/ammo powerups
                if (gameState.levelAssets.collectibles.powerups && gameState.levelAssets.collectibles.powerups.items) {
                    gameState.levelAssets.collectibles.powerups.items.forEach(powerup => {
                        savedPowerups[powerup.id] = {
                            collected: powerup.collected
                        };
                    });
                }
            }
            
            // Load the level
            Wolf.Level.load(Wolf.Episodes[game.episodeNum].levels[game.levelNum].file, {
                powerups: savedPowerups,
                tileMap: gameState.level.tileMap, // Pass the saved tileMap state
                wallTexX: gameState.level.wallTexX, // Pass the saved wall textures X
                wallTexY: gameState.level.wallTexY,  // Pass the saved wall textures Y
                floor: gameState.level.floor, // Pass the saved floor color
                ceiling: gameState.level.ceiling // Pass the saved ceiling color
            },function(error, level) {
                if (error) {
                    throw error;
                }
                
                game.level = level;
                
                // Restore the saved tileMap state if it exists
                if (gameState.level.tileMap) {
                    for (let x = 0; x < 64; x++) {
                        for (let y = 0; y < 64; y++) {
                            level.tileMap[x][y] = gameState.level.tileMap[x][y];
                        }
                    }
                }
                
                // Restore the saved wall textures if they exist
                if (gameState.level.wallTexX) {
                    for (let x = 0; x < 64; x++) {
                        for (let y = 0; y < 64; y++) {
                            level.wallTexX[x][y] = gameState.level.wallTexX[x][y];
                            level.wallTexY[x][y] = gameState.level.wallTexY[x][y];
                        }
                    }
                }
                
                // Restore floor and ceiling colors if they exist
                if (gameState.level.floor && gameState.level.ceiling) {
                    level.floor = [...gameState.level.floor];
                    level.ceiling = [...gameState.level.ceiling];
                    
                    $("#game .renderer .floor").css({
                        "background-color" : "rgb("
                            + level.floor[0] + ","
                            + level.floor[1] + ","
                            + level.floor[2] + ")"
                    });
                    
                    $("#game .renderer .ceiling").css({
                        "background-color" : "rgb("
                            + level.ceiling[0] + ","
                            + level.ceiling[1] + ","
                            + level.ceiling[2] + ")"
                    });
                }
                
                // Store saved powerup states in level
                level.state.savedPowerups = savedPowerups;
                
                // Restore statistics if they exist in the saved state
                if (gameState.levelAssets && gameState.levelAssets.statistics) {
                    const stats = gameState.levelAssets.statistics;
                    level.state.totalMonsters = stats.totalMonsters || 0;
                    level.state.killedMonsters = stats.killedMonsters || 0;
                    level.state.totalSecrets = stats.totalSecrets || 0;
                    level.state.foundSecrets = stats.foundSecrets || 0;
                    level.state.totalTreasure = stats.totalTreasure || 0;
                    level.state.foundTreasure = stats.foundTreasure || 0;
                    level.state.startTime = stats.startTime || Date.now();
                    level.state.elapsedTime = stats.elapsedTime || 0;
                }
                
                // First scan the info plane to spawn all actors
                // Set a flag to prevent incrementing totalMonsters during spawn
                level.state.isLoadingSavedGame = true;
                Wolf.Level.scanInfoPlane(level, game.skill);
                level.state.isLoadingSavedGame = false;
                
                // Create a map of actor positions to their saved states
                const savedActorMap = new Map();
                if (gameState.actors) {
                    gameState.actors.forEach(savedActor => {
                        savedActorMap.set(savedActor.id, savedActor);
                    });
                }
                
                // Restore actor states using IDs
                level.state.guards.forEach(actor => {
                    if (!actor) return;
                    
                    const savedActor = savedActorMap.get(actor.id);
                    if (savedActor) {
                        if (savedActor.isDead || savedActor.health <= 0) {
                            // Start the death sequence
                            actor.state = Wolf.st_die1;
                            actor.health = 0;
                            actor.speed = 0;
                            actor.ticcount = Wolf.objstate[actor.type][Wolf.st_die1].timeout;
                            actor.flags &= ~Wolf.FL_SHOOTABLE;
                            actor.isDead = true;
                            
                            // Set the initial death sprite
                            Wolf.Sprites.setTex(level, actor.sprite, 0, Wolf.objstate[actor.type][Wolf.st_die1].texture);
                            
                            // Force the death sequence to complete immediately
                            actor.state = Wolf.st_die2;
                            Wolf.Sprites.setTex(level, actor.sprite, 0, Wolf.objstate[actor.type][Wolf.st_die2].texture);
                            
                            actor.state = Wolf.st_die3;
                            Wolf.Sprites.setTex(level, actor.sprite, 0, Wolf.objstate[actor.type][Wolf.st_die3].texture);
                            
                            // Finally set to dead state
                            actor.state = Wolf.st_dead;
                            Wolf.Sprites.setTex(level, actor.sprite, 0, Wolf.objstate[actor.type][Wolf.st_dead].texture);
                        } else {
                            // Restore actor state for living actors
                            actor.state = savedActor.state;
                            actor.health = savedActor.health;
                            actor.angle = savedActor.angle;
                            actor.speed = (actor.type == Wolf.en_dog) ? Wolf.SPDDOG : Wolf.SPDPATROL;
                            actor.flags |= Wolf.FL_SHOOTABLE;
                        }
                    }
                });
                
                // Restore player state
                game.player = Wolf.Player.spawn(level.spawn, level, game.skill);
                game.player.position = gameState.player.position;
                game.player.angle = gameState.player.angle;
                game.player.health = gameState.player.health;
                game.player.score = gameState.player.score;
                game.player.lives = gameState.player.lives;
                game.player.ammo = gameState.player.ammo;
                game.player.weapons = gameState.player.weapons;
                game.player.items = gameState.player.items;
                
                // Start the game
                playing = true;
                startGameCycle(game);
                startRenderCycle(game);
                Wolf.Input.reset();
                Wolf.Input.lockPointer();
                
                $("#game").focus();
                $("#game .renderer .player-weapon").show();
                keyInputActive = true;
                
                // Start the level music
                if (level.music) {
                    Wolf.Sound.startMusic(level.music);
                }
            });
            
            return true;
        } catch (e) {
            console.error('Failed to load game:', e);
            return false;
        }
    }
   
    return {
        startGame : startGame,
        startLevel : startLevel,
        startIntermission : startIntermission,
        startDamageFlash : startDamageFlash,
        startBonusFlash : startBonusFlash,
        enableMouse : enableMouse,
        isMouseEnabled : isMouseEnabled,
        isPlaying : isPlaying,
        notify : notify,
        isFullscreen : isFullscreen,
        init : init,
        getControls : getControls,
        bindControl : bindControl,
        resume : resume,
        victory : victory,
        endEpisode : endEpisode,
        saveGameState : saveGameState,
        loadGameState : loadGameState
        
        /*
        dump : dump,
        debugGodMode : debugGodMode,
        debugNoTarget : debugNoTarget,
        debugToggleAI : debugToggleAI,
        debugGiveAll : debugGiveAll,
        debugVictory : debugVictory,
        debugEndEpisode : debugEndEpisode
        */
    };

})();