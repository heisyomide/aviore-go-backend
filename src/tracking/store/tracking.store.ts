import { Injectable } from "@nestjs/common";
import { LiveLocation } from "../interfaces/live-location.interface";

@Injectable()
export class TrackingStore {
  private readonly locations = new Map<string, LiveLocation>();

  set(location: LiveLocation) {
    this.locations.set(location.riderId, location);
  }

  get(riderId: string) {
    return this.locations.get(riderId);
  }

  has(riderId: string) {
    return this.locations.has(riderId);
  }

  remove(riderId: string) {
    this.locations.delete(riderId);
  }

  getAll() {
    return Array.from(this.locations.values());
  }

  clear() {
    this.locations.clear();
  }
}