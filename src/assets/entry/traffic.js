export const SPLASH_DURATION_MS = 3500

const SECOND_STOPS_MS = 650
const SECOND_CLEARED_MS = 1360
const THIRD_STOPS_MS = 1880
const THIRD_CLEARED_MS = 2560

function travel(time, start, end, from, to) {
  const progress = Math.max(0, Math.min(1, (time - start) / (end - start)))
  const eased = progress * progress * (3 - 2 * progress)
  return from + (to - from) * eased
}

export function playWarehouseTraffic(scene) {
  const fleet = scene.querySelector('.ce-fleet')
  const robots = ['01', '02', '03'].map(id => fleet.querySelector(`[data-amr="${id}"]`))
  const secondHold = robots[1].querySelector('.ce-hold')
  const thirdHold = robots[2].querySelector('.ce-hold')
  const reservation = scene.querySelector('.ce-reservation')
  const eastStop = scene.querySelector('.ce-stop-east')
  const westStop = scene.querySelector('.ce-stop-west')

  function draw(time) {
    // Signed distance from the intersection along each robot's aisle.
    const distances = [
      travel(time, 0, 2130, -57, 97),
      time < SECOND_CLEARED_MS
        ? travel(time, 0, SECOND_STOPS_MS, -78, -43)
        : travel(time, SECOND_CLEARED_MS, 3310, -43, 92),
      time < THIRD_CLEARED_MS
        ? travel(time, 0, THIRD_STOPS_MS, -151, -43)
        : travel(time, THIRD_CLEARED_MS, 3450, -43, 29),
    ]
    const westboundCleared = time >= SECOND_CLEARED_MS && time < THIRD_CLEARED_MS
    reservation.setAttribute('transform', westboundCleared ? 'scale(-1 1)' : 'scale(1 1)')
    westStop.setAttribute('visibility', westboundCleared ? 'hidden' : 'visible')
    eastStop.setAttribute('visibility', westboundCleared ? 'visible' : 'hidden')
    const secondWaiting = time >= SECOND_STOPS_MS && time < SECOND_CLEARED_MS
    const thirdWaiting = time >= THIRD_STOPS_MS && time < THIRD_CLEARED_MS
    secondHold.setAttribute('visibility', secondWaiting ? 'visible' : 'hidden')
    thirdHold.setAttribute('visibility', thirdWaiting ? 'visible' : 'hidden')

    robots.forEach((robot, index) => {
      const distance = distances[index]
      const x = 865 + (index === 1 ? -distance : distance)
      const y = 205 + 0.41 * distance
      robot.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)})`)
    })

    // Nearer robots and their cargo paint over farther robots.
    const order = [0, 1, 2].sort((a, b) => distances[a] - distances[b])
    order.forEach((index, layer) => {
      const current = fleet.children[layer]
      if (current !== robots[index]) fleet.insertBefore(robots[index], current)
    })
  }

  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    draw(900)
    return () => {}
  }

  draw(0)
  const start = performance.now()
  let frame
  function tick(time) {
    const elapsed = time - start
    draw(elapsed)
    if (elapsed < SPLASH_DURATION_MS) frame = requestAnimationFrame(tick)
  }
  frame = requestAnimationFrame(tick)
  return () => cancelAnimationFrame(frame)
}
