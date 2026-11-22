import { MaxLength } from 'class-validator';
import { RequiredText } from '../../church/dto/field-decorators';

export class SearchYoutubeQueryDto {
  @RequiredText()
  @MaxLength(100)
  q!: string;
}

export class ImportYoutubeDto {
  @RequiredText()
  @MaxLength(255)
  urlOrId!: string;
}
