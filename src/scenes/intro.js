// The prologue: a painted cutscene that plays before a new journey begins.
import { Cutscene } from '../gfx/cutscene.js';
import { introShots } from '../data/story.js';
import { CLASSES } from '../data/classes.js';
import { LOOKS } from '../gfx/sprites.js';

export class IntroScene {
  constructor(app, state) {
    this.app = app;
    this.cut = new Cutscene(introShots(CLASSES[state.classId].name), {
      music: 'story',
      ctx: { look: LOOKS[state.classId], shake: app.options.screenShake },
      onDone: () => app.startGame(state),
    });
  }

  update(dt) { this.cut.update(dt, this.app.facade); }
  drawWorld(g) { g.fillStyle = '#000'; g.fillRect(0, 0, 480, 270); this.cut.drawWorld(g, this.app.facade); }
  drawUI(u) { this.cut.draw(u, this.app.facade); }
}
