"use strict";

export class AssetLoader {
  constructor({ logger = console } = {}) {
    this.logger = logger;
    this.records = new Map();
  }

  loadImage(key, src) {
    const existing = this.records.get(key);
    if (existing) return existing.promise;

    const record = {
      key,
      src,
      image: null,
      status: "loading",
      error: null,
      promise: null,
      warned: false
    };

    record.promise = new Promise((resolve) => {
      const image = new Image();
      image.onload = () => {
        record.image = image;
        record.status = "loaded";
        resolve(image);
      };
      image.onerror = () => {
        record.status = "failed";
        record.error = new Error(`Failed to load image asset "${key}" from "${src}".`);
        this.warnOnce(record);
        resolve(null);
      };
      image.src = src;
    });

    this.records.set(key, record);
    return record.promise;
  }

  async loadImages(entries) {
    const requests = Object.entries(entries).map(([key, src]) => this.loadImage(key, src));
    return Promise.all(requests);
  }

  getImage(key) {
    const record = this.records.get(key);
    return record?.status === "loaded" ? record.image : null;
  }

  getStatus(key) {
    const record = this.records.get(key);
    return record ? record.status : "missing";
  }

  has(key) {
    return this.records.has(key);
  }

  warnOnce(record) {
    if (record.warned) return;
    record.warned = true;
    this.logger.warn(record.error.message);
  }
}
