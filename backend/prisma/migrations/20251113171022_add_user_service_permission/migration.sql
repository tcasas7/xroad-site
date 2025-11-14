-- CreateTable
CREATE TABLE "UserServicePermission" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "providerId" TEXT,
    "serviceId" TEXT,
    "canView" BOOLEAN NOT NULL DEFAULT false,
    "canDownload" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserServicePermission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserServicePermission_userId_idx" ON "UserServicePermission"("userId");

-- CreateIndex
CREATE INDEX "UserServicePermission_providerId_idx" ON "UserServicePermission"("providerId");

-- CreateIndex
CREATE INDEX "UserServicePermission_serviceId_idx" ON "UserServicePermission"("serviceId");

-- AddForeignKey
ALTER TABLE "UserServicePermission" ADD CONSTRAINT "UserServicePermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserServicePermission" ADD CONSTRAINT "UserServicePermission_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserServicePermission" ADD CONSTRAINT "UserServicePermission_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;
