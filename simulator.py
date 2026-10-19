"""Six-DOF brushed microquadcopter model. SI units, Z up, X forward.

All motor, mass and electrical parameters are illustrative design assumptions,
not measurements of the proposed hardware. No ESP32 firmware is executed here.
"""
import math
import numpy as np
import pybullet as p

DT = 1 / 240
MASS = 0.085
ARM = 0.045
MAX_THRUST = 0.45  # N per motor at nominal voltage; must be measured on hardware
WAYPOINTS = [[0, 0, 1.2], [1.8, 0, 1.2], [0, 1.8, 1.2], [-1.8, 0, 1.2], [0, -1.8, 1.2]]


def clamp(x, lo, hi):
    return max(lo, min(hi, x))


class DroneSim:
    def __init__(self):
        self.client = p.connect(p.DIRECT)
        self.rng = np.random.default_rng(1540)
        self.reset()

    def reset(self, scenario="hover", gain=1.0, wind=0.0):
        p.resetSimulation(physicsClientId=self.client)
        p.setGravity(0, 0, -9.81, physicsClientId=self.client)
        p.setTimeStep(DT, physicsClientId=self.client)
        plane = p.createCollisionShape(p.GEOM_PLANE, physicsClientId=self.client)
        self.floor = p.createMultiBody(0, plane, physicsClientId=self.client)
        shape = p.createCollisionShape(p.GEOM_BOX, halfExtents=[0.055, 0.055, 0.018], physicsClientId=self.client)
        self.body = p.createMultiBody(MASS, shape, basePosition=[0, 0, 0.022], physicsClientId=self.client)
        p.changeDynamics(self.body, -1, localInertiaDiagonal=[0.000075, 0.000075, 0.00013],
                         linearDamping=0, angularDamping=0, restitution=0, physicsClientId=self.client)
        self.motors_xy = np.array([[ARM, -ARM], [-ARM, -ARM], [-ARM, ARM], [ARM, ARM]])
        self.spin = np.array([1, -1, 1, -1])
        self.mixer = np.vstack([np.ones(4), self.motors_xy[:, 1], -self.motors_xy[:, 0], self.spin * .006])
        self.inv_mixer = np.linalg.inv(self.mixer)
        self.scenario, self.gain, self.wind = scenario, gain, wind
        self.time = 0.0
        self.running = False
        self.phase = "READY"
        self.target = np.array([0., 0., 1.2])
        self.thrust = np.zeros(4)
        self.integral_z = 0.
        self.yaw_target = 0.
        self.visited = []
        self.waypoint = 0
        self.dwell = 0.
        self.events = [{"t": 0, "text": "Model ready · propeller / power checks complete"}]
        self.history = []
        self.rows = []
        self.errors = []
        self.energy = 0.
        self.link_lost = False
        self.gust_until = 0.
        self.link_timer = None
        self.complete = False
        self.contact = False
        self.rng = np.random.default_rng(1540)
        self.sample()

    def event(self, text):
        self.events.append({"t": round(self.time, 2), "text": text})
        self.events = self.events[-30:]

    def start(self):
        if self.complete:
            self.reset(self.scenario, self.gain, self.wind)
        self.running = True
        if self.phase == "READY":
            self.phase = "TAKEOFF"
            self.event("ARMED · virtual altitude assistance enabled")

    def command(self, action, data):
        if action == "start": self.start()
        elif action == "pause": self.running = False
        elif action == "reset": self.reset(data.get("scenario", self.scenario), float(data.get("gain", self.gain)), float(data.get("wind", self.wind)))
        elif action == "gust":
            self.gust_until = self.time + 1.2
            self.event("Disturbance injected · 0.12 N lateral force for 1.2 s")
        elif action == "disconnect": self.lose_link()
        elif action == "land":
            self.phase = "LANDING"
            self.event("Landing requested · virtual height feedback")
        elif action == "target" and not self.link_lost and self.phase not in ("LANDING", "FAILSAFE", "LANDED", "MISSION", "RETURN"):
            self.target[:2] = [clamp(float(data.get("x", 0)), -2.5, 2.5), clamp(float(data.get("y", 0)), -2.5, 2.5)]
            self.target[2] = clamp(float(data.get("z", 1.2)), .3, 2.5)
            self.event("Mobile command received · updated position setpoint")

    def lose_link(self):
        if not self.link_lost:
            self.link_lost = True
            self.link_timer = self.time
            self.event("Wi-Fi link lost · command timeout running")

    def step(self):
        if not self.running or self.complete: return
        self.time += DT
        pos, quat = p.getBasePositionAndOrientation(self.body, physicsClientId=self.client)
        vel, omega = p.getBaseVelocity(self.body, physicsClientId=self.client)
        pos, vel, omega = np.array(pos), np.array(vel), np.array(omega)
        roll, pitch, yaw = p.getEulerFromQuaternion(quat)
        if self.phase == "TAKEOFF" and pos[2] > 1.12 and abs(vel[2]) < .15:
            self.phase = "MISSION" if self.scenario == "waypoints" else "HOVER"
            self.event("Takeoff complete · stabilized at 1.2 m")
        if self.scenario == "disturbance" and 7 <= self.time < 7 + DT:
            self.gust_until = self.time + 1.2
            self.event("Scheduled disturbance · lateral gust applied")
        if self.scenario == "linkloss" and self.time >= 9 and not self.link_lost:
            self.lose_link()
        if self.link_lost and self.time - self.link_timer >= .5 and self.phase not in ("FAILSAFE", "LANDED"):
            self.phase = "FAILSAFE"
            self.event("500 ms timeout · simulated assisted landing engaged")
        if self.phase == "MISSION":
            self.target = np.array(WAYPOINTS[self.waypoint], dtype=float)
            if np.linalg.norm(self.target-pos) < .15 and np.linalg.norm(vel) < .22:
                self.dwell += DT
                if self.dwell > 1.:
                    self.visited.append(self.waypoint)
                    self.event(f"Beacon {self.waypoint+1}/5 acquired · held within 0.15 m for 1 s")
                    self.waypoint += 1
                    self.dwell = 0.
                    if self.waypoint == 5:
                        self.phase = "RETURN"
                        self.target = np.array([0., 0., 1.2])
                        self.event("All five beacons acquired · returning home")
            else: self.dwell = 0.
        if self.phase == "RETURN" and np.linalg.norm(pos-self.target) < .15 and np.linalg.norm(vel) < .2:
            self.phase = "LANDING"
            self.event("Home acquired · landing")
        if self.phase in ("LANDING", "FAILSAFE"):
            self.target[2] = max(.010, self.target[2] - .28 * DT)
            contact = p.getContactPoints(self.body, self.floor, physicsClientId=self.client)
            if contact and self.target[2] < .04 and abs(vel[2]) < .12:
                self.phase = "LANDED"
                self.complete = True
                self.running = False
                self.thrust[:] = 0
                self.event("Touchdown confirmed · motors disarmed")
        # Virtual navigation sensors. These are not available on an MPU6050 alone.
        measured_pos = pos + self.rng.normal(0, .001, 3)
        err = self.target - measured_pos
        self.integral_z = clamp(self.integral_z + err[2]*DT, -.4, .4)
        acc = self.gain * 1.7 * err - 2.3 * vel
        acc[2] = self.gain * 4.5 * err[2] - 3.2*vel[2] + .5*self.integral_z
        ax, ay = np.clip(acc[:2], -2.4, 2.4)
        desired_roll = clamp((ax*math.sin(yaw) - ay*math.cos(yaw))/9.81, -.30, .30)
        desired_pitch = clamp((ax*math.cos(yaw) + ay*math.sin(yaw))/9.81, -.30, .30)
        # IMU-like angle/rate noise; no firmware or full MPU6050 register emulation.
        angles = np.array([roll, pitch, yaw]) + self.rng.normal(0, .0007, 3)
        rotation = np.array(p.getMatrixFromQuaternion(quat)).reshape(3, 3)
        rates_body = rotation.T @ omega
        angle_error = np.array([desired_roll, desired_pitch, self.yaw_target]) - angles
        angle_error[2] = math.atan2(math.sin(angle_error[2]), math.cos(angle_error[2]))
        torque = np.array([.007, .007, .004])*self.gain*angle_error - np.array([.0014,.0014,.0018])*rates_body
        collective = MASS * (9.81 + acc[2]) / max(.75, math.cos(roll)*math.cos(pitch))
        desired = np.clip(self.inv_mixer @ np.r_[collective, torque], 0, MAX_THRUST)
        self.thrust += (desired-self.thrust) * (1-math.exp(-DT/.025))
        if self.phase == "LANDED": self.thrust[:] = 0
        for i, (x, y) in enumerate(self.motors_xy):
            p.applyExternalForce(self.body, -1, [0,0,float(self.thrust[i])], [float(x),float(y),0], p.LINK_FRAME, physicsClientId=self.client)
        p.applyExternalTorque(self.body, -1, [0,0,float(np.dot(self.spin,self.thrust)*.006)], p.LINK_FRAME, physicsClientId=self.client)
        external = np.array([self.wind*.035, self.wind*.015, 0.]) - .025*vel
        if self.time < self.gust_until: external += np.array([.12,-.055,0])
        p.applyExternalForce(self.body, -1, external.tolist(), pos.tolist(), p.WORLD_FRAME, physicsClientId=self.client)
        p.stepSimulation(physicsClientId=self.client)
        self.energy += (1.0 + 14*float(sum((self.thrust/MAX_THRUST)**1.5))) * DT
        if self.time > 4 and self.phase not in ("LANDING", "FAILSAFE", "LANDED"):
            self.errors.append(float(np.linalg.norm(err)))
        if max(abs(roll), abs(pitch)) > 1.1 or pos[2] > 4 or np.linalg.norm(pos[:2]) > 5:
            self.running = False
            self.phase = "ABORTED"
            self.event("Envelope exceeded · reset before continuing")
        if round(self.time/DT) % 12 == 0: self.sample()

    def sample(self):
        pos, quat = p.getBasePositionAndOrientation(self.body, physicsClientId=self.client)
        vel, omega = p.getBaseVelocity(self.body, physicsClientId=self.client)
        angles = p.getEulerFromQuaternion(quat)
        error = float(np.linalg.norm(np.array(pos)-self.target))
        row = {"time_s": round(self.time, 3), "x_m": pos[0], "y_m": pos[1], "z_m": pos[2],
               "target_x_m": float(self.target[0]), "target_y_m": float(self.target[1]), "target_z_m": float(self.target[2]),
               "roll_deg": math.degrees(angles[0]), "pitch_deg": math.degrees(angles[1]), "yaw_deg": math.degrees(angles[2]),
               "error_m": error, "phase": self.phase, **{f"motor_{i+1}_N": float(v) for i,v in enumerate(self.thrust)}}
        self.rows.append(row)
        self.history.append([round(self.time,2),pos[2],float(self.target[2]),error,math.degrees(angles[0]),math.degrees(angles[1])])
        self.history = self.history[-500:]

    def state(self):
        pos, quat = p.getBasePositionAndOrientation(self.body, physicsClientId=self.client)
        vel, omega = p.getBaseVelocity(self.body, physicsClientId=self.client)
        return {"time": self.time, "running": self.running, "phase": self.phase, "scenario": self.scenario,
                "position": pos, "quaternion": quat, "angles": p.getEulerFromQuaternion(quat), "velocity": vel,
                "target": self.target.tolist(), "motors": (self.thrust/MAX_THRUST).tolist(), "thrust": self.thrust.tolist(),
                "visited": self.visited, "waypoints": WAYPOINTS, "events": self.events[-8:], "history": self.history,
                "error": float(np.linalg.norm(np.array(pos)-self.target)), "rmse": math.sqrt(np.mean(np.square(self.errors))) if self.errors else 0.,
                "battery": max(0, 100*(1-self.energy/(3.7*.5*3600))), "energy": self.energy, "link": not self.link_lost,
                "gain": self.gain, "wind": self.wind, "complete": self.complete, "mass": MASS, "maxThrust": MAX_THRUST}

    def close(self):
        p.disconnect(self.client)
