import { IsString, IsUrl, MaxLength } from 'class-validator';
import { IsCpf } from '../../../common/is-cpf.validator';

/** `POST /public/tenants/:slug/contributions/access-link` */
export class RequestContributorAccessLinkDto {
  @IsCpf()
  cpf!: string;

  /** Página do site que recebe `?token=`. O origin deve estar nas origens públicas do tenant. */
  @IsUrl(
    { require_protocol: true, protocols: ['http', 'https'], require_tld: false },
    { message: 'returnUrl deve ser uma URL http(s) válida' },
  )
  @MaxLength(2048)
  returnUrl!: string;
}

/** `POST /public/tenants/:slug/contributions/session` */
export class CreateContributorSessionDto {
  /** Token inválido/vazio responde 401 `INVALID_TOKEN` (não 400). */
  @IsString()
  @MaxLength(512)
  token!: string;
}
