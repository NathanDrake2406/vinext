function hasParamProperty<T extends Record<string, unknown>>(obj: T, prop: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

export function makeThenableParams<T extends Record<string, unknown>>(obj: T) {
  const plain = { ...obj };
  const promise = Promise.resolve(plain);

  return new Proxy(promise, {
    get(target, prop, receiver) {
      if (hasParamProperty(plain, prop)) {
        return Reflect.get(plain, prop);
      }

      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
    getOwnPropertyDescriptor(target, prop) {
      if (hasParamProperty(plain, prop)) {
        return {
          configurable: true,
          enumerable: true,
          value: Reflect.get(plain, prop),
          writable: true,
        };
      }

      return Reflect.getOwnPropertyDescriptor(target, prop);
    },
    has(target, prop) {
      return hasParamProperty(plain, prop) || Reflect.has(target, prop);
    },
    ownKeys() {
      return Reflect.ownKeys(plain);
    },
  });
}
