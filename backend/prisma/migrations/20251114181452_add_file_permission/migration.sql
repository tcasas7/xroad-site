-- CreateTable
CREATE TABLE "UserFilePermission" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "canView" BOOLEAN NOT NULL DEFAULT false,
    "canDownload" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "UserFilePermission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserFilePermission_userId_serviceId_filename_key" ON "UserFilePermission"("userId", "serviceId", "filename");

-- AddForeignKey
ALTER TABLE "UserFilePermission" ADD CONSTRAINT "UserFilePermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFilePermission" ADD CONSTRAINT "UserFilePermission_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
