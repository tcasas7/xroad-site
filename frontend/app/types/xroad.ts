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
  id: string;
  code: string;   
  serviceCode: string;           
  version?: string | null;
  type?: string | null;
  endpoints: EndpointSummary[];
  canView?: boolean;
  canDownload?: boolean;
  
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
