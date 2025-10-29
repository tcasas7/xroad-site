/*
  Warnings:

  - A unique constraint covering the columns `[serviceId,path]` on the table `Endpoint` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[providerId,serviceCode]` on the table `Service` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "public"."Endpoint_serviceId_idx";

-- DropIndex
DROP INDEX "public"."Service_providerId_serviceCode_idx";

-- CreateIndex
CREATE UNIQUE INDEX "Endpoint_serviceId_path_key" ON "Endpoint"("serviceId", "path");

-- CreateIndex
CREATE UNIQUE INDEX "Service_providerId_serviceCode_key" ON "Service"("providerId", "serviceCode");
