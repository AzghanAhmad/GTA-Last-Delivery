/**
 * The Blackout Job mission states.
 *
 * The state machine is linear: each state advances to the next in `update`
 * based on the live game context fed by Game each frame. MISSION_RESTARTING is
 * a transient state set by `reset()` before `start()` returns to INTRO.
 *
 * The concrete mission (HeistMission) is the single owner of this state; Game
 * only reacts to `onStateChange` and drives the world (camera, audio, wanted
 * level) in response.
 */
export enum MissionState {
  /** Establishing shot / intro banner. No objective is active yet. */
  INTRO = "intro",
  /** Objective: reach the warehouse district. */
  GO_TO_WAREHOUSE = "goToWarehouse",
  /** Objective: find the target vehicle inside the restricted area. */
  REACH_WAREHOUSE = "reachWarehouse",
  /** Objective: steal the target vehicle (short theft cinematic). */
  STEAL_TARGET = "stealTarget",
  /** Objective: escape the warehouse district before the police arrive. */
  ESCAPE_WAREHOUSE = "escapeWarehouse",
  /** Objective: lose the police / survive the chase (main gameplay highlight). */
  POLICE_CHASE = "policeChase",
  /** Objective: reach the docks delivery zone. */
  REACH_DOCKS = "reachDocks",
  /** Objective: deliver the target vehicle (short delivery cinematic). */
  DELIVER_VEHICLE = "deliverVehicle",
  /** Objective: exit the car and walk to the extraction point. */
  FINAL_ESCAPE = "finalEscape",
  /** Mission ended successfully. */
  MISSION_COMPLETE = "missionComplete",
  /** Mission ended in failure (busted, vehicle destroyed or time out). */
  MISSION_FAILED = "missionFailed",
  /** Transient: set by reset() while the world resets for a fresh run. */
  MISSION_RESTARTING = "missionRestarting",
}
