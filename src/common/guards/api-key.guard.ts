import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, string> }>();
    const key = request.headers['x-webserviceutsapi-key'];
    if (!key || key !== process.env.UTS_WEBSERVICE_API_KEY) {
      throw new UnauthorizedException('Invalid API key');
    }
    return true;
  }
}
