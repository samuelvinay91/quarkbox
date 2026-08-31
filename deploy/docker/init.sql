-- QuarkBox Database Initialization
-- This script runs on first PostgreSQL startup

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create enum types
CREATE TYPE sandbox_status AS ENUM (
  'creating',
  'running',
  'paused',
  'stopped',
  'error',
  'deleting'
);

CREATE TYPE sandbox_runtime AS ENUM (
  'docker',
  'containerd',
  'firecracker'
);

CREATE TYPE snapshot_status AS ENUM (
  'creating',
  'ready',
  'restoring',
  'error'
);
