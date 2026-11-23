import { UnauthorizedException } from '@nestjs/common';

/**
 * Refresh rejected because the presented token is no longer the current one: it was rotated by a parallel
 * refresh (another tab), or replaced by a newer login. Still a 401 for the client, but the controller must
 * NOT clear the cookie here: when two tabs refresh at once, the winner's Set-Cookie may already have put
 * the new token in the browser, and clearing it would log the user out.
 */
export class SessionSupersededException extends UnauthorizedException {}
