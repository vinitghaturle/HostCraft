import { db } from "./firebase";
import { doc, setDoc, updateDoc, onSnapshot, getDoc, collection, getDocs, query, where } from "firebase/firestore";
import { getMyDeviceId, syncthingRequest } from "./syncthing";
import { appLocalDataDir, join } from "@tauri-apps/api/path";

/**
 * Push the local device ID to Firestore for a specific group to request access.
 */
export async function requestDeviceSync(groupId: string, uid: string) {
  const deviceId = await getMyDeviceId();
  const deviceRef = doc(db, "groups", groupId, "devices", deviceId);
  
  const snap = await getDoc(deviceRef);
  if (!snap.exists()) {
    await setDoc(deviceRef, {
      uid,
      deviceId,
      approved: false,
      ownerDeviceId: null,
      createdAt: Date.now()
    });
  }

  return deviceId;
}

/**
 * Adds a remote device to local Syncthing config and shares the group folder with it.
 */
export async function addRemoteDeviceAndFolder(remoteDeviceId: string, groupId: string) {
  // 1. Get current config
  const config = await syncthingRequest("/rest/config");

  // 2. Add device if not exists
  if (!config.devices.find((d: any) => d.deviceID === remoteDeviceId)) {
    const defaultDevice = await syncthingRequest("/rest/config/defaults/device").catch(() => ({}));
    config.devices.push({
      ...defaultDevice,
      deviceID: remoteDeviceId,
      name: `Device-${remoteDeviceId.substring(0, 5)}`,
      addresses: ["dynamic"],
      introducer: false
    });
  }

  // 3. Add folder if not exists, and share with this device
  let folder = config.folders.find((f: any) => f.id === groupId);
  
  if (!folder) {
    const localDataDir = await appLocalDataDir();
    const folderPath = await join(localDataDir, "papermc");
    const myDeviceId = await getMyDeviceId();
    const defaultFolder = await syncthingRequest("/rest/config/defaults/folder").catch(() => ({}));

    folder = {
      ...defaultFolder,
      id: groupId,
      label: `Minecraft-${groupId}`,
      path: folderPath,
      type: "sendreceive",
      devices: [{ deviceID: config.devices.find((d: any) => d.deviceID === myDeviceId)?.deviceID || "" }]
    };
    config.folders.push(folder);
  }

  // Ensure remote device is in the folder's devices list
  if (!folder.devices.find((d: any) => d.deviceID === remoteDeviceId)) {
    folder.devices.push({ deviceID: remoteDeviceId, introducedBy: "" });
  }

  // 4. Save config
  await syncthingRequest("/rest/config", "PUT", config);
}

/**
 * Approve a device request (Owner only)
 */
export async function approveDevice(groupId: string, deviceId: string) {
  const myDeviceId = await getMyDeviceId();
  
  // Setup local config first
  await addRemoteDeviceAndFolder(deviceId, groupId);

  // Mark as approved in Firestore and give our device ID so they can connect back
  await updateDoc(doc(db, "groups", groupId, "devices", deviceId), {
    approved: true,
    ownerDeviceId: myDeviceId
  });
}
