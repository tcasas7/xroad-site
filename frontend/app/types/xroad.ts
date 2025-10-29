// app/types/xroad.ts

export interface ProviderSummary {
  id: string;
  displayName: string;
  hasServices: boolean;
}

export interface EndpointSummary {
  method: string;
  path: string;
}

export interface ServiceSummary {
  code: string;              // <- ahora es siempre .code (alias de serviceCode)
  version?: string | null;
  type?: string | null;
  endpoints: EndpointSummary[];
}

export interface ProviderServicesResponse {
  provider: string;
  services: ServiceSummary[];
}

export interface EndpointsModalProps {
  provider: ProviderSummary;
  service: ServiceSummary;
  endpoints: EndpointSummary[];
  onClose: () => void;
}
