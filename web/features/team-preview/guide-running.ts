/**
 * Whether the tutorial is currently driving the screen.
 *
 * The guide decides where the page should sit for each step, and the app's own
 * habit of pulling the map or the tactical card into view fights it: choosing
 * a territory scrolled the page one way while the guide was scrolling it
 * another, and the two together read as a stutter. Anything that moves the
 * page of its own accord asks here first and stands down while the guide runs.
 */
let running = false;

export function setGuideRunning(next: boolean) {
  running = next;
}

export function isGuideRunning() {
  return running;
}
