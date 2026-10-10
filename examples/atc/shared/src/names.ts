import { isAirlineCallsign } from './aircraft';

const AIRLINES: Readonly<Record<string, string>> = {
  AAL: 'American Airlines',
  UAL: 'United Airlines',
  DAL: 'Delta Air Lines',
  SWA: 'Southwest Airlines',
  ASA: 'Alaska Airlines',
  JBU: 'JetBlue',
  NKS: 'Spirit Airlines',
  FFT: 'Frontier Airlines',
  AAY: 'Allegiant Air',
  SCX: 'Sun Country Airlines',
  HAL: 'Hawaiian Airlines',
  SKW: 'SkyWest Airlines',
  RPA: 'Republic Airways',
  ENY: 'Envoy Air',
  EDV: 'Endeavor Air',
  JIA: 'PSA Airlines',
  PDT: 'Piedmont Airlines',
  ASH: 'Mesa Airlines',
  GJS: 'GoJet Airlines',
  AWI: 'Air Wisconsin',
  ACA: 'Air Canada',
  JZA: 'Jazz Aviation',
  WJA: 'WestJet',
  AMX: 'Aeroméxico',
  VOI: 'Volaris',
  BAW: 'British Airways',
  VIR: 'Virgin Atlantic',
  EIN: 'Aer Lingus',
  DLH: 'Lufthansa',
  SWR: 'Swiss',
  AUA: 'Austrian Airlines',
  AFR: 'Air France',
  KLM: 'KLM',
  IBE: 'Iberia',
  LOT: 'LOT Polish Airlines',
  SAS: 'SAS',
  THY: 'Turkish Airlines',
  UAE: 'Emirates',
  QTR: 'Qatar Airways',
  ETD: 'Etihad Airways',
  ANA: 'All Nippon Airways',
  JAL: 'Japan Airlines',
  KAL: 'Korean Air',
  CPA: 'Cathay Pacific',
  EVA: 'EVA Air',
  FDX: 'FedEx',
  UPS: 'UPS Airlines',
  GTI: 'Atlas Air',
  ABX: 'ABX Air',
  CKS: 'Kalitta Air',
};

const AIRCRAFT_TYPES: Readonly<Record<string, string>> = {
  A19N: 'Airbus A319neo',
  A20N: 'Airbus A320neo',
  A21N: 'Airbus A321neo',
  A319: 'Airbus A319',
  A320: 'Airbus A320',
  A321: 'Airbus A321',
  A332: 'Airbus A330-200',
  A333: 'Airbus A330-300',
  A339: 'Airbus A330-900',
  A359: 'Airbus A350-900',
  A35K: 'Airbus A350-1000',
  A388: 'Airbus A380',
  BCS1: 'Airbus A220-100',
  BCS3: 'Airbus A220-300',
  B712: 'Boeing 717',
  B737: 'Boeing 737-700',
  B738: 'Boeing 737-800',
  B739: 'Boeing 737-900',
  B37M: 'Boeing 737 MAX 7',
  B38M: 'Boeing 737 MAX 8',
  B39M: 'Boeing 737 MAX 9',
  B3XM: 'Boeing 737 MAX 10',
  B744: 'Boeing 747-400',
  B748: 'Boeing 747-8',
  B752: 'Boeing 757-200',
  B753: 'Boeing 757-300',
  B762: 'Boeing 767-200',
  B763: 'Boeing 767-300',
  B764: 'Boeing 767-400',
  B772: 'Boeing 777-200',
  B77L: 'Boeing 777-200LR',
  B77W: 'Boeing 777-300ER',
  B788: 'Boeing 787-8',
  B789: 'Boeing 787-9',
  B78X: 'Boeing 787-10',
  MD11: 'McDonnell Douglas MD-11',
  CRJ2: 'Bombardier CRJ200',
  CRJ7: 'Bombardier CRJ700',
  CRJ9: 'Bombardier CRJ900',
  CRJX: 'Bombardier CRJ1000',
  E135: 'Embraer ERJ 135',
  E145: 'Embraer ERJ 145',
  E170: 'Embraer 170',
  E75L: 'Embraer 175',
  E75S: 'Embraer 175',
  E190: 'Embraer 190',
  E195: 'Embraer 195',
  E290: 'Embraer E190-E2',
  E295: 'Embraer E195-E2',
  DH8D: 'De Havilland Dash 8-400',
  AT76: 'ATR 72-600',
};

/** The airline's name for a callsign, or its three-letter code when unknown. */
export function airlineName(callsign: string): string {
  const code = callsign.slice(0, 3).toUpperCase();

  return AIRLINES[code] ?? code;
}

/**
 * The airline's name when `callsign` is an airline callsign (`UAL1372`), or
 * null for private callsigns, registrations and missing callsigns.
 */
export function airlineFor(callsign: string | null): string | null {
  return callsign !== null && isAirlineCallsign(callsign)
    ? airlineName(callsign)
    : null;
}

/** A readable aircraft type, the raw ICAO type code, or "Unknown type". */
export function aircraftTypeName(typeCode: string | null): string {
  if (typeCode === null) {
    return 'Unknown type';
  }

  return AIRCRAFT_TYPES[typeCode.toUpperCase()] ?? typeCode;
}
