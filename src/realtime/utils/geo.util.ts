export class GeoUtil {
  /**
   * Calculate distance between two coordinates
   * using the Haversine Formula.
   *
   * Returns distance in kilometers.
   */
  static distanceInKm(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371;

    const dLat = this.toRadians(
      lat2 - lat1,
    );

    const dLon = this.toRadians(
      lon2 - lon1,
    );

    const a =
      Math.sin(dLat / 2) *
        Math.sin(dLat / 2) +
      Math.cos(
        this.toRadians(lat1),
      ) *
        Math.cos(
          this.toRadians(lat2),
        ) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c =
      2 *
      Math.atan2(
        Math.sqrt(a),
        Math.sqrt(1 - a),
      );

    return R * c;
  }

  private static toRadians(
    degrees: number,
  ) {
    return (
      degrees * (Math.PI / 180)
    );
  }
}