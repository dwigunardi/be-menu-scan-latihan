# MenuScan Backend Service 🍽️📱

> Backend API service untuk **MenuScan** – Sistem Menu Digital Restoran berbasis QR Code. Built with **NestJS**, **PostgreSQL**, **Prisma ORM**, **Zod**, and **AES-256-GCM Payload Encryption**.

---

## 🚀 Technology Stack

- **Framework**: [NestJS](https://nestjs.com/) (v11)
- **Database & ORM**: PostgreSQL & [Prisma ORM](https://www.prisma.io/)
- **Validation**: [Zod](https://zod.dev/) & [`nestjs-zod`](https://github.com/risen-crypto/nestjs-zod)
- **Authentication**: JWT Dual-Token Strategy (Access Token 15m + Refresh Token 7d)
- **Security**: ECDH Key Exchange + AES-256-GCM Payload Encryption (End-to-End Handshake)
- **Logging**: Structured Step-Tracing Logger (`nestjs-pino`)
- **API Documentation**: Swagger / OpenAPI (Integrated with Zod DTOs)

---

## 🏛️ System Architecture & Documentation

Perencanaan, arsitektur, dan pelacakan milestone sistem terdokumentasi di folder `docs/`:

- 🗺️ **[Implementation Milestones & Roadmap](docs/roadmap/implementation-milestones.md)**  
  Dokumen tracking tahapan & milestone pengerjaan proyek dari Phase 0 hingga Phase 4.
- 📄 **[Wireframe API & Blueprint Schema](docs/wireframe/wireframe-api-not-final.md)**  
  Rincian endpoint Public & Admin, skema Prisma, dan kebutuhan paket.
- 📄 **[Payload Encryption Strategy](docs/security/encryption-decryption-strategy.md)**  
  Spesifikasi protokol ECDH Handshake, HKDF Key Derivation, dan format payload terenkripsi AES-256-GCM.
- 📄 **[Architecture Design Specification](docs/architecture/architecture-design.md)**  
  Struktur folder modular `src/`, diagram alur eksekusi request-response (Middleware, Guard, Pipe, Interceptor).
- 📄 **[Step-Tracing Logging Strategy](docs/architecture/logging-strategy.md)**  
  Pino structured logging, data redaction, & Opsi B (Hybrid Transport).
- 📄 **[Database & Query Strategy Specification](docs/architecture/database-strategy.md)**  
  Indexing strategy, soft delete, N+1 query prevention, & slow query threshold monitoring.

---

## ⚙️ Quick Start / Installation

### 1. Prasyarat

- Node.js (v18+)
- PostgreSQL Database Server

### 2. Setup Environment

Salin file `.env.example` menjadi `.env` dan sesuaikan nilainya:

```bash
cp .env.example .env
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Database Setup & Migration (Prisma)

```bash
# Generate Prisma Client
npx prisma generate

# Jalankan Database Migration
npx prisma migrate dev --name init
```

### 5. Jalankan Server Development

```bash
npm run start:dev
```

Server akan berjalan secara default di: `http://localhost:3000`  
Dokumentasi Swagger API dapat diakses di: `http://localhost:3000/api/docs`

---

## 🧪 Testing

```bash
# Unit tests
npm run test

# End-to-end tests
npm run test:e2e

# Test coverage
npm run test:cov
```

---

## 📜 License

Project ini berlisensi [UNLICENSED](LICENSE).

<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->
