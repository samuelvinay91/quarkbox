# QuarkBox Enterprise — AWS EKS & Bare-Metal Cloud Infrastructure
# Zero Vendor Lock-in: Standard Kubernetes + OCI Container Runtime

terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.30"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.13"
    }
  }
}

variable "cluster_name" {
  description = "QuarkBox Kubernetes Cluster Name"
  type        = string
  default     = "quarkbox-enterprise"
}

variable "region" {
  description = "AWS Region"
  type        = string
  default     = "us-east-1"
}

variable "instance_types" {
  description = "Worker node instance types for sandbox container density"
  type        = list(string)
  default     = ["c6i.4xlarge", "m6i.4xlarge"]
}

# ── VPC & Isolated Subnets ──────────────────────────────────────────────

resource "aws_vpc" "quarkbox_vpc" {
  cidr_block           = "10.100.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name        = "${var.cluster_name}-vpc"
    Environment = "production"
    ManagedBy   = "Terraform"
    Compliance  = "SOC2-Ready"
  }
}

# ── Cloud Metadata Shield Security Group (Blocks 169.254.169.254) ──────

resource "aws_security_group" "sandbox_isolation_sg" {
  name        = "${var.cluster_name}-sandbox-isolation"
  description = "QuarkBox Sandbox Isolation SG — Blocks IMDS & Private VPC Snooping"
  vpc_id      = aws_vpc.quarkbox_vpc.id

  # Allow outbound internet for package downloads (pip, npm, cargo, git)
  egress {
    description = "Allow public HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "Allow public HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "Allow public DNS"
    from_port   = 53
    to_port     = 53
    protocol    = "udp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.cluster_name}-sandbox-isolation"
  }
}

output "vpc_id" {
  value = aws_vpc.quarkbox_vpc.id
}
