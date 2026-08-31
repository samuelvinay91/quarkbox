# QuarkBox Enterprise — GCP GKE Multi-Zone Cloud Infrastructure
# Zero Vendor Lock-in: Runs on Google Cloud Platform with Metadata Protection

terraform {
  required_version = ">= 1.5.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

variable "project_id" {
  description = "GCP Project ID"
  type        = string
  default     = "quarkbox-prod"
}

variable "region" {
  description = "GCP Region"
  type        = string
  default     = "us-central1"
}

resource "google_compute_network" "quarkbox_vpc" {
  name                    = "quarkbox-vpc"
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "quarkbox_subnet" {
  name          = "quarkbox-subnet"
  ip_cidr_range = "10.10.0.0/20"
  region        = var.region
  network       = google_compute_network.quarkbox_vpc.id
}

# ── Cloud Firewall: Block GKE / GCP Metadata Server (169.254.169.254) ────
resource "google_compute_firewall" "block_metadata" {
  name    = "quarkbox-block-metadata"
  network = google_compute_network.quarkbox_vpc.name

  deny {
    protocol = "all"
  }

  destination_ranges = ["169.254.169.254/32"]
  direction          = "EGRESS"
  priority           = 100
  target_tags        = ["quarkbox-sandbox"]
}

output "network_name" {
  value = google_compute_network.quarkbox_vpc.name
}
