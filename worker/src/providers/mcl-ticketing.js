import {
  getMCLWebApiTicketing
} from "./mcl-webapi-ticketing.js";

import {
  getMCLTicketingV2
} from "./mcl-ticketing-v2.js";

export async function getMCLTicketing(movieSetId, selectedDate = null) {
  let webApiError = null;

  try {
    return await getMCLWebApiTicketing(movieSetId, selectedDate);
  } catch (error) {
    webApiError = error;
  }

  try {
    return await getMCLTicketingV2(movieSetId, selectedDate);
  } catch {
    const detail = webApiError instanceof Error
      ? webApiError.message
      : String(webApiError || "unavailable");

    throw new Error(
      `MCL ticketing unavailable; WebAPI fallback: ${detail}`
    );
  }
}
