-- AlterTable
ALTER TABLE "shipments" ADD COLUMN     "destinationLandmark" TEXT,
ADD COLUMN     "pickupLandmark" TEXT,
ADD COLUMN     "senderName" TEXT,
ADD COLUMN     "senderPhone" TEXT,
ALTER COLUMN "pickupPlaceId" DROP NOT NULL,
ALTER COLUMN "destinationPlaceId" DROP NOT NULL;
