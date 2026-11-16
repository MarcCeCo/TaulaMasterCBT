// Genera un UUID v4 estàndard (criptogràficament segur, disponible nativament)
export const uid = (): string => crypto.randomUUID();
