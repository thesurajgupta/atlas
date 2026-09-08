export interface Threat {
  id: string;
  timestamp: string;
  ipAddress: string;
  location: string;
  fraudType: 'Account Takeover' | 'Payment Fraud' | 'Bot Attack' | 'Identity Theft' | 'Credential Stuffing';
  riskScore: number; // 0 - 100
  severity: 'Critical' | 'High' | 'Medium' | 'Low';
  status: 'Active' | 'Investigating' | 'Mitigated' | 'Ignored';
  userEmail: string;
}

export const initialThreats: Threat[] = [
  {
    id: 'TRT-9082',
    timestamp: '2026-09-07 23:48:12',
    ipAddress: '192.168.1.104',
    location: 'Moscow, RU',
    fraudType: 'Credential Stuffing',
    riskScore: 94,
    severity: 'Critical',
    status: 'Active',
    userEmail: 'alex.m@company.com',
  },
  {
    id: 'TRT-9081',
    timestamp: '2026-09-07 23:45:00',
    ipAddress: '45.12.89.201',
    location: 'Beijing, CN',
    fraudType: 'Payment Fraud',
    riskScore: 88,
    severity: 'High',
    status: 'Investigating',
    userEmail: 'sarah.k@platform.io',
  },
  {
    id: 'TRT-9080',
    timestamp: '2026-09-07 23:41:30',
    ipAddress: '185.220.101.5',
    location: 'Frankfurt, DE',
    fraudType: 'Bot Attack',
    riskScore: 62,
    severity: 'Medium',
    status: 'Active',
    userEmail: 'guest_8821@temp.org',
  },
  {
    id: 'TRT-9079',
    timestamp: '2026-09-07 23:38:15',
    ipAddress: '103.21.244.0',
    location: 'Mumbai, IN',
    fraudType: 'Account Takeover',
    riskScore: 91,
    severity: 'Critical',
    status: 'Active',
    userEmail: 'rahul.s@enterprise.com',
  },
  {
    id: 'TRT-9078',
    timestamp: '2026-09-07 23:30:10',
    ipAddress: '82.102.23.1',
    location: 'London, UK',
    fraudType: 'Identity Theft',
    riskScore: 45,
    severity: 'Low',
    status: 'Mitigated',
    userEmail: 'j.doe@domain.com',
  },
  {
    id: 'TRT-9077',
    timestamp: '2026-09-07 23:25:44',
    ipAddress: '198.51.100.42',
    location: 'Sao Paulo, BR',
    fraudType: 'Payment Fraud',
    riskScore: 78,
    severity: 'High',
    status: 'Investigating',
    userEmail: 'carlos.r@shop.br',
  },
  {
    id: 'TRT-9076',
    timestamp: '2026-09-07 23:19:02',
    ipAddress: '193.56.28.12',
    location: 'Kyiv, UA',
    fraudType: 'Credential Stuffing',
    riskScore: 98,
    severity: 'Critical',
    status: 'Active',
    userEmail: 'admin_test@corp.net',
  },
  {
    id: 'TRT-9075',
    timestamp: '2026-09-07 23:10:05',
    ipAddress: '203.0.113.195',
    location: 'Tokyo, JP',
    fraudType: 'Bot Attack',
    riskScore: 35,
    severity: 'Low',
    status: 'Ignored',
    userEmail: 'service_bot@api.com',
  },
  {
    id: 'TRT-9074',
    timestamp: '2026-09-07 23:02:50',
    ipAddress: '172.56.21.89',
    location: 'New York, US',
    fraudType: 'Account Takeover',
    riskScore: 82,
    severity: 'High',
    status: 'Mitigated',
    userEmail: 'emily.w@tech.io',
  },
];