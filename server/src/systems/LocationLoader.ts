// server/src/systems/LocationLoader.ts
import { WorldObject } from "../schemas/WorldObject";
import { villageData } from "../data/locations/village";
import type { MyRoom } from "../MyRoom";

export class LocationLoader {
  static load(room: MyRoom, locationName: string) {
    if (locationName === "village") {
      for (const obj of villageData) {
        const wo = new WorldObject();
        wo.id = obj.id;
        wo.modelName = obj.modelName;
        wo.x = obj.x;
        wo.z = obj.z;
        wo.scaleX = obj.scaleX;
        wo.scaleY = obj.scaleY;
        wo.scaleZ = obj.scaleZ;
        wo.rotationY = obj.rotationY || 0;
        wo.rotationX = obj.rotationX || 0;
        wo.color = obj.color;
        room.state.worldObjects.set(wo.id, wo);
      }
      console.log(`[LOCATION] Деревня загружена (${villageData.length} объектов)`);
    }
  }
}