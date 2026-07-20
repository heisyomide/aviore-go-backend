import { ConnectedRider } from '../../realtime/interfaces/connected-rider.interface';

export interface NearbyRider {
  rider: ConnectedRider;
  distance: number;
}