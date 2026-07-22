-- CreateTable
CREATE TABLE "landmarks" (
    "id" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'Osun',
    "city" TEXT NOT NULL DEFAULT 'Osogbo',
    "name" TEXT NOT NULL,
    "aliases" TEXT[],
    "description" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "landmarks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "landmarks_city_idx" ON "landmarks"("city");

-- CreateIndex
CREATE INDEX "landmarks_is_active_idx" ON "landmarks"("is_active");
