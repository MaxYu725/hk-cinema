import {
  getMCLWebApiTicketing
} from "./mcl-webapi-ticketing.js";

export async function getMCLTicketing(movieSetId, selectedDate = null) {
  return await getMCLWebApiTicketing(movieSetId, selectedDate);
}
