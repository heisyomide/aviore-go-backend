export const SocketEvents = {
  CONNECTION: 'connection',

  DISCONNECT: 'disconnect',

  RIDER_ONLINE: 'rider:online',

  RIDER_OFFLINE: 'rider:offline',

  LOCATION_UPDATE: 'location:update',

  TRACKING_UPDATE: 'tracking:update',

  NEW_JOB: 'job:new',

  JOB_ACCEPTED: 'job:accepted',

  JOB_CANCELLED: 'job:cancelled',

  SHIPMENT_COMPLETED: 'shipment:completed',
} as const;